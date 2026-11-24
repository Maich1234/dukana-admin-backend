import jwt from 'jsonwebtoken';
import AdminRefreshToken from '../models/admin/AdminRefreshToken.js';
import AdminUser from '../models/admin/AdminUser.js';
import { activeAdminSessionFilter } from '../services/refreshTokenService.js';
import { SUPER_ADMIN_ROLE_SLUG } from '../constants/permissions.js';

/**
 * Gates /admin/* routes. Verifies against ADMIN_JWT_SECRET (never
 * AGENT_JWT_SECRET) and requires the `type: 'admin'` claim — an Agent's
 * token (a different secret, a wholly separate principal) fails verification
 * here regardless of payload shape, and so does any smart-duka-backend
 * shop-user token (different secret, different service entirely).
 */
export const protectAdmin = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer')) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET, { maxAge: 60 });
    if (decoded.type !== 'admin') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const admin = await AdminUser.findById(decoded.id).select('-password').populate('roleId');
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin not found' });
    }
    if (!admin.active) {
      return res.status(401).json({ success: false, message: 'Admin account deactivated' });
    }
    if (!admin.roleId) {
      // A role was deleted out from under this admin, or never assigned —
      // fail closed rather than let requirePermission crash on a null roleId.
      return res.status(401).json({ success: false, message: 'This account has no assigned role. Contact a super admin.' });
    }

    if (typeof decoded.sessionId !== 'string' || !await AdminRefreshToken.exists({
      admin: admin._id, sessionId: decoded.sessionId, ...activeAdminSessionFilter(),
    })) {
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }
    req.admin = admin;
    req.adminSessionId = decoded.sessionId;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

/** Gates admin-account/role management itself — never grantable via a permission, only role slug. */
export const requireSuperAdmin = (req, res, next) => {
  if (req.admin?.roleId?.slug === SUPER_ADMIN_ROLE_SLUG) return next();
  return res.status(403).json({ success: false, message: 'Access denied. Super admin only.' });
};

/** Gates a module's routes. super_admin bypasses; every other role needs the permission key in roleId.permissions. */
export const requirePermission = (permissionKey) => (req, res, next) => {
  if (req.admin?.roleId?.slug === SUPER_ADMIN_ROLE_SLUG || req.admin?.roleId?.permissions?.includes(permissionKey)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to access this resource.' });
};

/** Only a super admin can assign a role when creating an admin account. */
export const requireSuperAdminForRoleChange = (req, res, next) => {
  if (req.body?.roleId === undefined) return next();
  if (req.admin?.roleId?.slug === SUPER_ADMIN_ROLE_SLUG) return next();
  return res.status(403).json({ success: false, message: 'Only a super admin can assign or change an admin\'s role.' });
};
