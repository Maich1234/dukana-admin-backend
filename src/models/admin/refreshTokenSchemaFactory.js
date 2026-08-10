import mongoose from 'mongoose';

// Shared shape behind both AdminRefreshToken and AgentRefreshToken — one
// document per issued refresh token, mirroring smart-duka-backend's
// RefreshToken.js. Only the SHA-256 hash is stored; a database leak must not
// yield usable tokens. `principalField` is 'admin' or 'agent' so each
// collection's foreign key reads naturally instead of a generic `principal`.
export const createRefreshTokenSchema = (principalField, refModel) => {
  const schema = new mongoose.Schema({
    [principalField]: {
      type: mongoose.Schema.Types.ObjectId,
      ref: refModel,
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    deviceId: { type: String, default: null },
    deviceName: { type: String, default: null },
    platform: { type: String, enum: ['ios', 'android', 'web', null], default: null },
    // Why this doc stopped being usable — distinguishes intentional
    // revocation from a genuine replayed token (see refreshTokenService.js).
    revokedReason: {
      type: String,
      enum: ['rotated', 'manual_logout', 'superseded_by_new_device', 'admin_force_logout', 'password_change', 'token_reuse_detected', null],
      default: null,
    },
  });

  // Mongo removes expired docs shortly after expiresAt passes.
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  return schema;
};
