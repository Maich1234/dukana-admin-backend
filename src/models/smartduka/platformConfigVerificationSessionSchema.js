import mongoose from 'mongoose';

// Field-for-field copy of
// smart-duka-backend/src/models/PlatformConfigVerificationSession.js.
// `requestedByAdminId` drops its original `ref: 'AdminUser'` — see
// subscriptionSchema.js's header comment for why. This backend's own
// platformConfigVerificationService.js writes this backend's AdminUser._id
// here going forward.
const platformConfigVerificationSessionSchema = new mongoose.Schema({
  requestedByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  otpHash: { type: String, required: true },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000),
  },
  attempts: { type: Number, default: 0 },
  isUsed: { type: Boolean, default: false },
  lastAttemptAt: { type: Date },
}, { timestamps: true });

// MongoDB TTL: auto-delete expired sessions
platformConfigVerificationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default platformConfigVerificationSessionSchema;
