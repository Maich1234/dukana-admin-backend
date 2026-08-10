import mongoose from 'mongoose';

// One entry in an agent's pipeline: a lead the agent is working, through to
// a live, paying shop. Lives entirely in the admin DB — this is the single
// source of truth for agent↔shop assignment; no `assignedAgent` field is
// added to the untouched (secondary-connection) Shop schema.
//
// `shopId` is a plain ObjectId with no Mongoose `ref` — a `ref` can't cross
// connections, since Shop is bound to the secondary (smart-duka) connection.
// Any screen that needs the shop's name/status alongside an Onboarding row
// does two queries and joins with a Map in application code.
const reassignmentEntrySchema = new mongoose.Schema({
  fromAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
  toAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  changedAt: { type: Date, default: Date.now },
  reason: { type: String, default: '', trim: true },
}, { _id: false });

const onboardingSchema = new mongoose.Schema({
  // No ref — Shop lives in the secondary (smart-duka) database. Null until a
  // real shop signup is manually linked (see onboardingService.js — there is
  // no signup webhook in V1).
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
  },
  // Authoritative only for lead/registered/onboarding. Once shopId is set,
  // controllers must override the *displayed* stage with a live
  // Subscription.status join (via onboardingService.resolveDisplayStage) —
  // never trust a stale stored trial/active value, since the subscription
  // can change state (trial → active → past_due) without this document ever
  // being touched.
  stage: {
    type: String,
    enum: ['lead', 'registered', 'onboarding', 'trial', 'active'],
    default: 'lead',
  },
  leadName: { type: String, default: '', trim: true },
  leadPhone: { type: String, default: '', trim: true },
  leadEmail: { type: String, default: '', trim: true, lowercase: true },
  leadNotes: { type: String, default: '', trim: true },
  reassignmentHistory: {
    type: [reassignmentEntrySchema],
    default: [],
  },
  registeredAt: { type: Date, default: null },
  onboardingStartedAt: { type: Date, default: null },
  becameActiveAt: { type: Date, default: null },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: true,
  },
}, {
  timestamps: true,
});

onboardingSchema.index({ agentId: 1, stage: 1 });
// Sparse: many onboarding rows have no shop yet (still a lead), and only
// once linked must a shop map to at most one onboarding record.
onboardingSchema.index({ shopId: 1 }, { unique: true, sparse: true });

export default mongoose.model('Onboarding', onboardingSchema);
