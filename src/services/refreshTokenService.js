import crypto from 'crypto';
import AdminRefreshToken from '../models/admin/AdminRefreshToken.js';
import AgentRefreshToken from '../models/admin/AgentRefreshToken.js';
import { adminLoginVerificationRequired } from './adminLoginVerification.js';

// Same rotation + reuse-detection algorithm as smart-duka-backend's
// services/refreshTokenService.js, generalized into a factory so the exact
// logic isn't duplicated between the admin and agent principals — it's
// copied once, as a function, and instantiated twice below.

// 30-day sliding window: every rotation issues a fresh 30-day token, so an
// actively-used device stays signed in indefinitely while an abandoned one
// expires.
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const ADMIN_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

export const activeAdminSessionFilter = (now = new Date()) => ({
  revokedAt: null,
  expiresAt: { $gt: now },
  lastActivityAt: { $gt: new Date(now.getTime() - ADMIN_IDLE_TIMEOUT_MS) },
  ...(adminLoginVerificationRequired() && { loginVerified: true }),
});

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// Revocations recorded with one of these reasons were deliberate — a stale
// device retrying its refresh after one of these is an expected race, not an
// attack. Anything else (null, or 'rotated' from a normal same-device
// rotation) means the presented token was already consumed once before, i.e.
// a genuine replay.
const INTENTIONAL_REVOCATION_REASONS = new Set([
  'manual_logout',
  'superseded_by_new_device',
  'admin_force_logout',
  'password_change',
]);

export class RefreshTokenError extends Error {
  constructor(message, code = 'SESSION_EXPIRED') {
    super(message);
    this.status = 401;
    this.code = code;
  }
}

/**
 * Builds a { issueRefreshToken, rotateRefreshToken, revokeRefreshToken,
 * revokeAllSessions } bundle bound to one refresh-token Model and its
 * principal field name ('admin' or 'agent').
 */
export const createRefreshTokenService = (Model, principalField) => {
  const isAdmin = principalField === 'admin';

  /** Issues a new refresh token. Returns the RAW token (only time it exists in plaintext). */
  const issueRefreshToken = async (principalId, device = {}, sessionId = crypto.randomUUID(), transaction = null, priorSession = null) => {
    const raw = crypto.randomBytes(48).toString('hex');
    const now = new Date();
    await Model.create([{
      [principalField]: principalId,
      sessionId,
      tokenHash: hashToken(raw),
      expiresAt: isAdmin
        ? priorSession?.expiresAt ?? new Date(now.getTime() + ADMIN_SESSION_TTL_MS)
        : new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      ...(isAdmin && {
        lastActivityAt: priorSession?.lastActivityAt ?? now,
        loginVerified: priorSession ? priorSession.loginVerified === true : device.loginVerified === true,
      }),
      deviceId: device.deviceId ?? null,
      deviceName: device.deviceName ?? null,
      platform: device.platform ?? null,
    }], { session: transaction });
    return raw;
  };

  /**
   * Validates + rotates a refresh token: the presented token is revoked and a
   * replacement issued. Reuse of an already-revoked token usually means the
   * token leaked — but it can also mean the principal was deliberately
   * superseded (new login elsewhere, admin force-logout, password change)
   * and is now retrying its old refresh token unaware it's dead. Only the
   * former is treated as theft.
   */
  const rotateRefreshToken = async (raw) => {
    if (!raw || typeof raw !== 'string' || raw.length > 256) {
      throw new RefreshTokenError('Invalid refresh token');
    }
    const tokenHash = hashToken(raw);
    const now = new Date();

    let rotated;
    await Model.db.transaction(async (transaction) => {
      rotated = null;
      const active = isAdmin
        ? activeAdminSessionFilter()
        : { revokedAt: null, expiresAt: { $gt: now } };
      const doc = await Model.findOneAndUpdate(
        { tokenHash, ...active },
        { $set: { revokedAt: now, revokedReason: 'rotated' } },
        { session: transaction },
      );
      if (!doc) return null;
      const sessionId = doc.sessionId || crypto.randomUUID();
      if (!doc.sessionId) {
        await Model.updateOne({ _id: doc._id }, { $set: { sessionId } }, { session: transaction });
      }
      const refreshToken = await issueRefreshToken(doc[principalField], {
        deviceId: doc.deviceId,
        deviceName: doc.deviceName,
        platform: doc.platform,
      }, sessionId, transaction, doc);
      rotated = { principalId: doc[principalField], refreshToken, sessionId };
    });
    if (rotated) return rotated;

    const spent = await Model.findOne({ tokenHash });
    if (spent?.revokedAt && spent.expiresAt > now) {
      if (INTENTIONAL_REVOCATION_REASONS.has(spent.revokedReason)) {
        throw new RefreshTokenError('Session expired. Please sign in again.', 'SESSION_REVOKED_ELSEWHERE');
      }
      await revokeAllSessions(spent[principalField], 'token_reuse_detected');
    }
    throw new RefreshTokenError('Session expired. Please sign in again.');
  };

  /** Best-effort revocation on logout. Unknown tokens are ignored. */
  const revokeRefreshToken = async (raw, reason = 'manual_logout') => {
    if (!raw || typeof raw !== 'string') return;
    await Model.db.transaction(async (transaction) => {
      const doc = await Model.findOne({ tokenHash: hashToken(raw) }).session(transaction);
      if (!doc) return;
      const identity = doc.sessionId ? { sessionId: doc.sessionId } : { _id: doc._id };
      await Model.updateMany(
        { ...identity, $or: [{ revokedAt: null }, { revokedReason: 'rotated' }] },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
        { session: transaction },
      );
    });
  };

  /** Bulk-revokes every active session for a principal (password change, admin force-logout, ...). */
  const revokeAllSessions = async (principalId, reason, session = null) => {
    const revoke = (transaction) => Model.updateMany(
      { [principalField]: principalId, $or: [{ revokedAt: null }, { revokedReason: 'rotated' }] },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
      { session: transaction },
    );
    if (session) return revoke(session);
    return Model.db.transaction(revoke);
  };

  return { issueRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllSessions };
};

export const adminRefreshTokenService = createRefreshTokenService(AdminRefreshToken, 'admin');
export const agentRefreshTokenService = createRefreshTokenService(AgentRefreshToken, 'agent');
