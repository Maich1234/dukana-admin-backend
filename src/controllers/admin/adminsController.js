import AdminUser from '../../models/admin/AdminUser.js';
import Role from '../../models/admin/Role.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';
import { adminRefreshTokenService } from '../../services/refreshTokenService.js';
import { SUPER_ADMIN_ROLE_SLUG } from '../../constants/permissions.js';

/** GET /admin/admins */
export const listAdmins = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const [admins, total] = await Promise.all([
    AdminUser.find().select('-password').populate('roleId', 'slug name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    AdminUser.countDocuments(),
  ]);
  res.json({ success: true, data: admins, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/**
 * POST /admin/admins — roleId is required (every admin needs a role), and
 * assigning one at all is already gated by requireSuperAdminForRoleChange at
 * the route level (see routes/v1/admin/adminsRoutes.js), so by the time this
 * runs the caller is either a super admin or the schema already rejected the
 * request for missing roleId.
 */
export const createAdmin = async (req, res) => {
  const role = await Role.findById(req.body.roleId);
  if (!role) {
    return res.status(400).json({ success: false, message: 'That role does not exist.' });
  }

  const admin = await AdminUser.create({ ...req.body, createdBy: req.admin._id });
  const response = admin.toObject();
  delete response.password;

  logAudit({
    adminId: req.admin._id,
    action: 'admin.admin.created',
    entityType: 'AdminUser',
    entityId: admin._id,
    details: { email: admin.email, roleId: String(role._id), roleSlug: role.slug },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: response });
};

/**
 * PATCH /admin/admins/:id — uses findById + mutate + save (never
 * findByIdAndUpdate) so the pre('save') password-hash hook fires when a new
 * password is sent.
 */
export const updateAdmin = async (req, res) => {
  const admin = await AdminUser.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

  const { name, email, password, roleId, active } = req.body;

  if (roleId !== undefined) {
    const role = await Role.findById(roleId);
    if (!role) return res.status(400).json({ success: false, message: 'That role does not exist.' });
  }

  const demotingOrDeactivatingSuperAdmin = await isLastActiveSuperAdmin(admin, { roleId, active });
  if (demotingOrDeactivatingSuperAdmin) {
    return res.status(409).json({ success: false, message: 'Cannot demote or deactivate the last active super admin.' });
  }

  const before = { roleId: String(admin.roleId), active: admin.active };

  if (name !== undefined) admin.name = name;
  if (email !== undefined) admin.email = email;
  if (password !== undefined) admin.password = password;
  if (roleId !== undefined) admin.roleId = roleId;
  if (active !== undefined) admin.active = active;

  await admin.save();

  if (active === false && before.active !== false) {
    // Deactivating an admin should end their existing sessions immediately,
    // not just block new logins.
    await adminRefreshTokenService.revokeAllSessions(admin._id, 'admin_force_logout');
  }

  logAudit({
    adminId: req.admin._id,
    action: 'admin.admin.updated',
    entityType: 'AdminUser',
    entityId: admin._id,
    details: { fieldsChanged: Object.keys(req.body), before, after: { roleId: String(admin.roleId), active: admin.active } },
    req,
  }).catch(() => {});

  const response = admin.toObject();
  delete response.password;
  res.json({ success: true, data: response });
};

async function isLastActiveSuperAdmin(admin, { roleId, active }) {
  const currentRole = await Role.findById(admin.roleId).select('slug');
  if (currentRole?.slug !== SUPER_ADMIN_ROLE_SLUG) return false;

  const demoting = roleId !== undefined && String(roleId) !== String(admin.roleId);
  const deactivating = active === false;
  if (!demoting && !deactivating) return false;

  const superAdminRole = await Role.findOne({ slug: SUPER_ADMIN_ROLE_SLUG }).select('_id');
  const otherActiveSuperAdmins = await AdminUser.countDocuments({
    roleId: superAdminRole?._id,
    active: true,
    _id: { $ne: admin._id },
  });
  return otherActiveSuperAdmins === 0;
}

/** PATCH /admin/admins/:id/suspend */
export const suspendAdmin = async (req, res) => {
  const admin = await AdminUser.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

  if (String(admin._id) === String(req.admin._id)) {
    return res.status(400).json({ success: false, message: 'You cannot suspend your own account.' });
  }
  if (await isLastActiveSuperAdmin(admin, { active: false })) {
    return res.status(409).json({ success: false, message: 'Cannot deactivate the last active super admin.' });
  }

  admin.active = false;
  await admin.save();
  await adminRefreshTokenService.revokeAllSessions(admin._id, 'admin_force_logout');

  logAudit({
    adminId: req.admin._id,
    action: 'admin.admin.suspended',
    entityType: 'AdminUser',
    entityId: admin._id,
    details: { reason: req.body?.reason ?? '' },
    req,
  }).catch(() => {});

  res.json({ success: true, data: { id: admin._id, active: admin.active } });
};

/** PATCH /admin/admins/:id/reactivate */
export const reactivateAdmin = async (req, res) => {
  const admin = await AdminUser.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

  admin.active = true;
  await admin.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.admin.reactivated',
    entityType: 'AdminUser',
    entityId: admin._id,
    req,
  }).catch(() => {});

  res.json({ success: true, data: { id: admin._id, active: admin.active } });
};
