import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Dukana's own internal platform staff — distinct from the shop-tenant User
// model (which lives in the secondary smart-duka connection). No `shop`
// field: admins aren't scoped to a tenant.
//
// Evolved from smart-duka-backend's role-enum + permissions[] shape to a
// roleId → Role reference, so access levels are data (editable via the
// Roles UI) rather than code. super_admin is still special-cased by slug in
// requireSuperAdmin — never by a permission entry — closing the
// self-escalation vector a permission-driven check would otherwise open.
const adminUserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: [true, 'Role is required'],
  },
  active: {
    type: Boolean,
    default: true,
  },
  // TOTP MFA — schema present for V2, no enroll/verify flow built in V1.
  mfaEnabled: {
    type: Boolean,
    default: false,
  },
  // AES-256-GCM encrypted blob (encryptionService), same scheme as
  // PlatformConfig credentials.
  mfaSecret: {
    type: String,
    default: null,
  },
  mfaBackupCodes: {
    type: [String],
    default: [],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

adminUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

adminUserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('AdminUser', adminUserSchema);
