import AdminUser from '../../models/admin/AdminUser.js';
import { randomUUID } from 'node:crypto';
import generateAdminToken from '../../utils/generateAdminToken.js';
import AdminRefreshToken from '../../models/admin/AdminRefreshToken.js';
import { activeAdminSessionFilter, adminRefreshTokenService, RefreshTokenError } from '../../services/refreshTokenService.js';
import { logAudit } from '../../services/auditLogService.js';
import { adminLoginVerificationRequired, requestAdminLoginCode, verifyAdminLoginCode } from '../../services/adminLoginVerification.js';

/** POST /admin/auth/login */
export const login = async (req, res) => {
  const { email, password } = req.body;

  const admin = await AdminUser.findOne({ email }).populate('roleId');
  if (!admin) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!admin.active || !admin.roleId) {
    return res.status(401).json({ success: false, message: 'Admin account deactivated' });
  }

  const isPasswordMatch = await admin.comparePassword(password);
  if (!isPasswordMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (adminLoginVerificationRequired()) {
    const result = await requestAdminLoginCode(admin);
    if (result.retry) return res.status(429).json({ success: false, message: 'Wait one minute before requesting another code.' });
    if (result.deliveryFailed) return res.status(503).json({ success: false, message: 'Could not deliver a sign-in code. Try again in a minute.' });
    return res.status(202).json({ success: true, data: { verificationRequired: true, challengeId: result.challengeId } });
  }
  return issueAdminSession(admin, req, res, false);
};

export const verifyLogin = async (req, res) => {
  const { challengeId, code } = req.body;
  const admin = await verifyAdminLoginCode(challengeId, code);
  if (!admin) return res.status(401).json({ success: false, message: 'Invalid or expired sign-in code.' });
  return issueAdminSession(admin, req, res, true);
};

async function issueAdminSession(admin, req, res, loginVerified) {
  const sessionId = randomUUID();
  const token = generateAdminToken(admin._id, sessionId);
  const refreshToken = await adminRefreshTokenService.issueRefreshToken(admin._id, {
    loginVerified,
    deviceId: req.body?.deviceId,
    deviceName: req.body?.deviceName,
    platform: req.body?.platform,
  }, sessionId);

  const currentAccount = await AdminUser.updateOne(
    { _id: admin._id, email: admin.email, password: admin.password, active: true, roleId: admin.roleId._id },
    { $set: { lastLoginAt: new Date() } },
  );
  if (!currentAccount.matchedCount) {
    await adminRefreshTokenService.revokeRefreshToken(refreshToken);
    return res.status(401).json({ success: false, message: 'Account changed. Please sign in again.' });
  }

  logAudit({
    adminId: admin._id,
    action: 'admin.auth.login',
    entityType: 'AdminUser',
    entityId: admin._id,
    details: { email: admin.email, loginVerified },
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
}

/** POST /admin/auth/refresh */
export const refresh = async (req, res) => {
  try {
    const { principalId, refreshToken, sessionId } = await adminRefreshTokenService.rotateRefreshToken(req.body?.refreshToken);

    const admin = await AdminUser.findById(principalId).select('active');
    if (!admin || !admin.active) {
      return res.status(401).json({ success: false, message: 'Account is no longer active.' });
    }

    res.json({
      success: true,
      data: { token: generateAdminToken(principalId, sessionId), refreshToken },
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

/** POST /admin/auth/activity */
export const recordActivity = async (req, res) => {
  const now = new Date();
  const result = await AdminRefreshToken.updateOne(
    { admin: req.admin._id, sessionId: req.adminSessionId, ...activeAdminSessionFilter(now) },
    { $max: { lastActivityAt: now } },
  );
  if (!result.matchedCount) {
    return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
  }
  return res.status(204).end();
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
