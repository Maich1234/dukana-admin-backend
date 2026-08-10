import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/Subscription.js.
// `graceExtensionGrantedBy` drops its original `ref: 'AdminUser'` — in the
// original repo that pointed at the same database's AdminUser collection;
// here AdminUser lives in the *primary* (admin) connection, so a ref would
// be dangling on this (secondary) connection. The field itself is unchanged
// (still an ObjectId, still holds this backend's AdminUser._id going
// forward) — only the cross-DB populate capability is removed, per the
// "never ref across connections" rule (see models/smartduka/index.js).
const seatAdjustmentSchema = new mongoose.Schema({
  fromCount: { type: Number, required: true },
  toCount: { type: Number, required: true },
  fullAmount: { type: Number, required: true },
  proratedAmount: { type: Number, required: true },
  fractionRemaining: { type: Number, required: true },
  reason: {
    type: String,
    enum: [
      'staff_added',
      'staff_reactivated',
      'staff_deactivated',
      'staff_removed',
      'staff_account_closed',
    ],
    required: true,
  },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  staffName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const subscriptionSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    unique: true,
    index: true,
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
  },
  status: {
    type: String,
    enum: ['trialing', 'active', 'past_due', 'cancelled'],
    default: 'trialing',
    index: true,
  },
  trialStart: { type: Date, default: null },
  trialEnd: { type: Date, default: null, index: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  currentPeriodEnd: { type: Date, default: null, index: true },
  staffCount: { type: Number, default: 1, min: 1 },
  seatAdjustments: { type: [seatAdjustmentSchema], default: [] },
  amountPaid: { type: Number, default: 0 },
  currency: { type: String, default: 'KES', uppercase: true, trim: true },
  paymentProvider: { type: String, enum: ['mpesa', 'card', 'bank', null], default: null },
  paymentReference: { type: String, default: null },
  promotion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promotion',
    default: null,
  },
  cancelledAt: { type: Date, default: null },
  graceExtensionDays: { type: Number, default: 0, min: 0 },
  graceExtensionGrantedAt: { type: Date, default: null },
  // No ref — see file header. This backend's grantGraceExtension writes this
  // backend's own AdminUser._id here.
  graceExtensionGrantedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  graceExtensionReason: { type: String, default: '', trim: true },
  remindersSent: { type: [String], default: [] },
  lastReminderSentAt: { type: Date, default: null },
  activatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

export default subscriptionSchema;
