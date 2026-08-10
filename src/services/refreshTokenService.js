import crypto from 'crypto';
import AdminRefreshToken from '../models/admin/AdminRefreshToken.js';
import AgentRefreshToken from '../models/admin/AgentRefreshToken.js';

// Same rotation + reuse-detection algorithm as smart-duka-backend's
// services/refreshTokenService.js, generalized into a factory so the exact
// logic isn't duplicated between the admin and agent principals — it's
// copied once, as a function, and instantiated twice below.

// 30-day sliding window: every rotation issues a fresh 30-day token, so an
// actively-used device stays signed in indefinitely while an abandoned one
// expires.
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  /** Issues a new refresh token. Returns the RAW token (only time it exists in plaintext). */
  const issueRefreshToken = async (principalId, device = {}) => {
    const raw = crypto.randomBytes(48).toString('hex');
    await Model.create({
      [principalField]: principalId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      deviceId: device.deviceId ?? null,
      deviceName: device.deviceName ?? null,
      platform: device.platform ?? null,
    });
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

    // Atomic claim: only one concurrent request can rotate a given token.
    const doc = await Model.findOneAndUpdate(
      { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { revokedAt: now, revokedReason: 'rotated' } }
    );

    if (!doc) {
      const spent = await Model.findOne({ tokenHash });
      if (spent) {
        if (INTENTIONAL_REVOCATION_REASONS.has(spent.revokedReason)) {
          throw new RefreshTokenError('Session expired. Please sign in again.', 'SESSION_REVOKED_ELSEWHERE');
        }
        // Replay of an organically-rotated (or already-replayed) token — kill
        // the whole session family.
        await Model.updateMany(
          { [principalField]: spent[principalField], revokedAt: null },
          { $set: { revokedAt: now, revokedReason: 'token_reuse_detected' } }
        );
      }
      throw new RefreshTokenError('Session expired. Please sign in again.');
    }

    const newRaw = await issueRefreshToken(doc[principalField], {
      deviceId: doc.deviceId,
      deviceName: doc.deviceName,
      platform: doc.platform,
    });
    return { principalId: doc[principalField], refreshToken: newRaw };
  };

  /** Best-effort revocation on logout. Unknown tokens are ignored. */
  const revokeRefreshToken = async (raw, reason = 'manual_logout') => {
    if (!raw || typeof raw !== 'string') return;
    await Model.updateOne(
      { tokenHash: hashToken(raw), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } }
    );
  };

  /** Bulk-revokes every active session for a principal (password change, admin force-logout, ...). */
  const revokeAllSessions = async (principalId, reason) => {
    await Model.updateMany(
      { [principalField]: principalId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } }
    );
  };

  return { issueRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllSessions };
};

export const adminRefreshTokenService = createRefreshTokenService(AdminRefreshToken, 'admin');
export const agentRefreshTokenService = createRefreshTokenService(AgentRefreshToken, 'agent');
