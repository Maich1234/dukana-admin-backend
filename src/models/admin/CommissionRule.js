import mongoose from 'mongoose';

// A commission policy the accrual cron matches transactions against. No
// delete endpoint anywhere in this app — only a status toggle — because
// CommissionRecords reference a rule by id for traceability, and a deleted
// rule would orphan that reference. Deactivate instead.
const commissionRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  // percentage: 0–100 of the source transaction amount. fixed: a flat amount
  // in the transaction's currency, regardless of size.
  value: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function (v) {
        return this.type !== 'percentage' || v <= 100;
      },
      message: 'A percentage commission value cannot exceed 100.',
    },
  },
  transactionType: {
    type: String,
    enum: ['subscription_payment'],
    default: 'subscription_payment',
  },
  // Empty = applies to every plan / every billing cycle.
  planSlugs: { type: [String], default: [] },
  billingCycles: { type: [String], enum: ['monthly', 'yearly'], default: [] },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: true,
  },
}, {
  timestamps: true,
});

export default mongoose.model('CommissionRule', commissionRuleSchema);
