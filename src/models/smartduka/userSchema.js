import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Field-for-field copy of smart-duka-backend/src/models/User.js. This
// backend only ever reads User docs (owner/staff lookups for shop-support
// and push-campaign segment resolution) — never creates or edits one — so
// the `sales` virtual populate (which targets the Sale model, not part of
// this backend's 10 bound smartduka schemas) is dropped, and the
// `permissions` field's dynamic default (smart-duka-backend's
// DEFAULT_STAFF_PERMISSIONS, a shop-staff-feature concept unrelated to this
// backend's own admin RBAC permissions in constants/permissions.js) is
// simplified to a plain empty-array default. Everything else — every field
// actually read by this backend or needed for a faithful lean() shape — is
// unchanged.
const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: [true, 'Password is required'], minlength: 6 },
  role: { type: String, enum: ['owner', 'staff'], default: 'staff' },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
  },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  phone: { type: String, trim: true },
  permissions: { type: [String], default: [] },
  commissionEligible: { type: Boolean, default: false },
  fcmTokens: { type: [String], default: [] },
  termsAcceptedAt: { type: Date, default: null },
  termsVersion: { type: String, default: null },
  deletionScheduledAt: { type: Date, default: null, index: true },
  deletionRequestedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Kept for schema fidelity even though this backend never calls .save() on a
// User — harmless no-op on a doc whose password isn't being modified.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default userSchema;
