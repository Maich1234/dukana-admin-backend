import Role from '../../models/admin/Role.js';
import AdminUser from '../../models/admin/AdminUser.js';
import { PERMISSION_GROUPS } from '../../constants/permissions.js';
import { logAudit } from '../../services/auditLogService.js';

// Every route in this controller is requireSuperAdmin-only — wired at the
// route level (routes/v1/admin/rolesRoutes.js) — Role CRUD is outright
// off-limits to any non-super-admin, not just permission-gated.

/** GET /admin/roles */
export const listRoles = async (req, res) => {
  const roles = await Role.find().sort({ isSystemRole: -1, name: 1 });
  res.json({ success: true, data: roles });
};

/** POST /admin/roles */
export const createRole = async (req, res) => {
  const role = await Role.create({ ...req.body, isSystemRole: false, createdBy: req.admin._id });

  logAudit({
    adminId: req.admin._id,
    action: 'admin.role.created',
    entityType: 'Role',
    entityId: role._id,
    details: { slug: role.slug, permissions: role.permissions },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: role });
};

/** PATCH /admin/roles/:id — rejects edits to the seeded system role unconditionally. */
export const updateRole = async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  if (role.isSystemRole) {
    return res.status(403).json({ success: false, message: 'This is a protected system role and cannot be edited.' });
  }

  Object.assign(role, req.body);
  await role.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.role.updated',
    entityType: 'Role',
    entityId: role._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: role });
};

/**
 * DELETE /admin/roles/:id — rejects the system role unconditionally, and
 * rejects any role still assigned to at least one AdminUser (deleting it
 * would leave that admin with a dangling roleId that protectAdmin/
 * requirePermission would then fail closed on).
 */
export const deleteRole = async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  if (role.isSystemRole) {
    return res.status(403).json({ success: false, message: 'This is a protected system role and cannot be deleted.' });
  }

  const inUse = await AdminUser.countDocuments({ roleId: role._id });
  if (inUse > 0) {
    return res.status(409).json({ success: false, message: `This role is assigned to ${inUse} admin${inUse === 1 ? '' : 's'} and cannot be deleted.` });
  }

  await role.deleteOne();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.role.deleted',
    entityType: 'Role',
    entityId: role._id,
    details: { slug: role.slug },
    req,
  }).catch(() => {});

  res.json({ success: true, message: 'Role deleted' });
};

/** GET /admin/permissions — feeds the Roles UI checkbox list. */
export const listPermissions = async (req, res) => {
  res.json({ success: true, data: PERMISSION_GROUPS });
};
