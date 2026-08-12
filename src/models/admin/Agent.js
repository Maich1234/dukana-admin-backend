import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// An onboarding/commission agent — a wholly separate principal from
// AdminUser (own JWT secret, own login, own middleware in agentAuth.js).
// Never holds a roleId or any permission: an agent's access is scope-based
// (their own assigned Onboarding/CommissionRecord rows only), not
// permission-list-based, so there is nothing here for a permission system
// to grant.
const agentSchema = new mongoose.Schema({
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
  phone: {
    type: String,
    default: '',
    trim: true,
  },
  // Shown on the printable verification tag (see the public /public/agents
  // route) alongside the QR code, so a shop owner meeting this agent in
  // person can match face to photo, not just a name.
  photoUrl: {
    type: String,
    default: '',
  },
  active: {
    type: Boolean,
    default: true,
  },
  mfaEnabled: {
    type: Boolean,
    default: false,
  },
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

agentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

agentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('Agent', agentSchema);
