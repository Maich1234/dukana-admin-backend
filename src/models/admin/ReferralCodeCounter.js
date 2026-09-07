import mongoose from 'mongoose';

// Mirrors smart-duka-backend/src/models/ReferralCodeCounter.js — a single
// document ('agent_referral_code') advanced with an atomic $inc so
// generateAgentReferralCode() never needs a database uniqueness probe.
const referralCodeCounterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

export default mongoose.model('ReferralCodeCounter', referralCodeCounterSchema);
