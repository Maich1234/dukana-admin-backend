import mongoose from 'mongoose';

// Field-for-field copy of
// smart-duka-backend/src/models/AgentReferralRedemption.js — written there
// by register.js on signup, consumed here by
// agentReferralLinkService.linkAgentReferralRedemptions() to create the
// matching Onboarding row (Onboarding lives in this backend's own,
// admin-native database, hence the manual join rather than a `ref` on
// onboardingId below).
const agentReferralRedemptionSchema = new mongoose.Schema({
  // No `ref`: Agent is registered on the admin-native connection, not this
  // (secondary) one.
  agentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, unique: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  redeemedAt: { type: Date, default: Date.now },
  linkedAt: { type: Date, default: null },
  // No `ref`: Onboarding is admin-native, not part of this connection.
  onboardingId: { type: mongoose.Schema.Types.ObjectId, default: null },
});

export default agentReferralRedemptionSchema;
