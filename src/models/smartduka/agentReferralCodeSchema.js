import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/AgentReferralCode.js
// — the mirror of an Agent's own referral code, written by this backend
// (agentsController.createAgent, and the daily cron's syncAgentReferralCodes)
// through the secondary connection, read by smart-duka-backend's register.js.
const agentReferralCodeSchema = new mongoose.Schema({
  // No `ref`: this schema is bound to the secondary (smart-duka) connection,
  // where Agent isn't registered — populate() only resolves within the same
  // connection's model registry. Join manually against the admin-native
  // Agent model when both are needed.
  agentId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  agentName: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default agentReferralCodeSchema;
