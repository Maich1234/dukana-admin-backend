import AdminUser from '../../models/admin/AdminUser.js';
import generateAdminToken from '../../utils/generateAdminToken.js';
import { adminRefreshTokenService, RefreshTokenError } from '../../services/refreshTokenService.js';
import { logAudit } from '../../services/auditLogService.js';

/** POST /admin/auth/login */
export const login = async (req, res) => {
  const { email, password } = req.body;

  const admin = await AdminUser.findOne({ email }).populate('roleId');
  if (!admin) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!admin.active) {
    return res.status(401).json({ success: false, message: 'Admin account deactivated' });
  }

  const isPasswordMatch = await admin.comparePassword(password);
  if (!isPasswordMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const token = generateAdminToken(admin._id);
  const refreshToken = await adminRefreshTokenService.issueRefreshToken(admin._id, {
    deviceId: req.body?.deviceId,
    deviceName: req.body?.deviceName,
    platform: req.body?.platform,
  });

  admin.lastLoginAt = new Date();
  await admin.save();

  logAudit({
    adminId: admin._id,
    action: 'admin.auth.login',
    entityType: 'AdminUser',
    entityId: admin._id,
    details: { email: admin.email },
    req,
  }).catch(() => {});

  res.json({
    success: true,
    data: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: { id: admin.roleId._id, slug: admin.roleId.slug, name: admin.roleId.name, permissions: admin.roleId.permissions },
      token,
      refreshToken,
    },
  });
};

/** POST /admin/auth/refresh */
export const refresh = async (req, res) => {
  try {
    const { principalId, refreshToken } = await adminRefreshTokenService.rotateRefreshToken(req.body?.refreshToken);

    const admin = await AdminUser.findById(principalId).select('active');
    if (!admin || !admin.active) {
      return res.status(401).json({ success: false, message: 'Account is no longer active.' });
    }

    res.json({
      success: true,
      data: { token: generateAdminToken(principalId), refreshToken },
    });
  } catch (err) {
    if (err instanceof RefreshTokenError) {
      return res.status(401).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }
};

/**
 * POST /admin/auth/logout — best-effort revocation, deliberately
 * unauthenticated: the access token may already be expired at logout time,
 * and possession of the refresh token is exactly the authority needed to
 * revoke it.
 */
export const logout = async (req, res) => {
  await adminRefreshTokenService.revokeRefreshToken(req.body?.refreshToken, 'manual_logout');
  res.json({ success: true, message: 'Logged out' });
};

/** GET /admin/auth/me */
export const getProfile = async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      role: {
        id: req.admin.roleId._id,
        slug: req.admin.roleId.slug,
        name: req.admin.roleId.name,
        permissions: req.admin.roleId.permissions,
      },
    },
  });
};
