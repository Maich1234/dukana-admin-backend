import mongoose from 'mongoose';

// Immutable commission ledger entry, one per accrued transaction. "Immutable"
// is enforced two ways: the unique compound index below makes accrual
// idempotent (the same SubscriptionPayment can never be accrued twice), and
// the pre('save') guard rejects any attempt to change the financial fields
// once the document already exists — "historical commission never
// recalculated" is a schema-level guarantee here, not just a convention any
// controller could accidentally violate.
//
// shopId/sourceTransactionId carry no `ref` — both point at documents in the
// secondary (smart-duka) connection, which this connection cannot resolve a
// populate() against. Screens that need shop/payment context do a manual
// second query and join with a Map.
const FROZEN_FIELDS = ['originalAmount', 'ruleType', 'ruleValue', 'commissionAmount', 'ruleId'];

const commissionRecordSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true,
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  onboardingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding',
    required: true,
  },
  sourceTransactionType: {
    type: String,
    enum: ['subscription_payment'],
    required: true,
  },
  // The SubscriptionPayment._id this commission was accrued from — lives in
  // the secondary connection, no ref.
  sourceTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // The transaction amount the commission was computed against, at accrual
  // time — a snapshot, not a live join, so a later change to the source
  // payment can never retroactively change history here.
  originalAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'KES', uppercase: true, trim: true },
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommissionRule',
    required: true,
  },
  // Snapshots of the rule's type/value at accrual time — the rule itself may
  // be edited or deactivated later without altering any commission it has
  // already produced.
  ruleType: { type: String, enum: ['percentage', 'fixed'], required: true },
  ruleValue: { type: Number, required: true, min: 0 },
  // Computed once, at accrual time. Never recomputed on read.
  commissionAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'cancelled'],
    default: 'pending',
    index: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
  },
  approvedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  cancelledReason: { type: String, default: '', trim: true },
}, {
  timestamps: true,
});

// Accrual idempotency guard: the same source transaction can only ever
// produce one commission record.
commissionRecordSchema.index({ sourceTransactionType: 1, sourceTransactionId: 1 }, { unique: true });

/**
 * Rejects any attempt to modify the financial/rule-snapshot fields on an
 * existing record. New documents (first accrual write) are unaffected —
 * this only fires on a genuine update of a doc that already has an _id in
 * the database. Exported separately (rather than inlined in the pre('save')
 * closure) so tests/commissionRecordImmutability.test.js can exercise the
 * guard directly, without needing a live DB connection to call .save().
 */
export function assertCommissionRecordImmutable(doc) {
  if (doc.isNew) return;
  const mutatedFrozenField = FROZEN_FIELDS.find((field) => doc.isModified(field));
  if (mutatedFrozenField) {
    throw new Error(`CommissionRecord.${mutatedFrozenField} cannot be modified once created — commission history is immutable.`);
  }
}

commissionRecordSchema.pre('save', function (next) {
  try {
    assertCommissionRecordImmutable(this);
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model('CommissionRecord', commissionRecordSchema);
