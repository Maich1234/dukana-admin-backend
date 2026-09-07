import { getSmartDukaModels } from '../models/smartduka/index.js';
import Agent from '../models/admin/Agent.js';
import { generateAgentReferralCode } from '../utils/referralCode.js';

/**
 * Generates a fresh code, saves it on the agent, and mirrors it into the
 * smart-duka DB (smart-duka-backend's register.js reads only that mirror —
 * it has no connection into this backend's own database). The mirror write
 * is best-effort: if it fails, syncAgentReferralCodes() (run by the daily
 * cron) picks it up on the next pass, since the Agent document itself is
 * already the source of truth for "does this agent have a code at all."
 */
export async function issueAgentReferralCode(agent) {
  const code = await generateAgentReferralCode();
  agent.code = code;
  await agent.save();

  try {
    const { AgentReferralCode } = await getSmartDukaModels();
    await AgentReferralCode.create({ agentId: agent._id, code, agentName: agent.name });
  } catch (err) {
    console.error('[agentReferralService] referral code mirror failed for', agent._id, '-', err.message);
  }

  return code;
}

/** Backfills a code for an agent created before this feature existed. */
export async function ensureAgentReferralCode(agent) {
  if (agent.code) return agent.code;
  return issueAgentReferralCode(agent);
}

/**
 * Daily-cron self-heal: finds every agent that has a code but whose mirror
 * in the smart-duka DB is missing (the best-effort write in
 * issueAgentReferralCode failed) and backfills the mirror. Does not touch
 * agents with no code at all — those are only ever created on demand, via
 * ensureAgentReferralCode, when something actually reads that agent.
 */
export async function syncAgentReferralCodes() {
  const { AgentReferralCode } = await getSmartDukaModels();

  const codedAgents = await Agent.find({ code: { $exists: true, $ne: null } }).select('name code').lean();
  const summary = { scanned: codedAgents.length, backfilled: 0, failed: 0 };
  if (codedAgents.length === 0) return summary;

  const mirrored = await AgentReferralCode.find({
    agentId: { $in: codedAgents.map((a) => a._id) },
  }).select('agentId').lean();
  const mirroredIds = new Set(mirrored.map((m) => String(m.agentId)));

  for (const agent of codedAgents) {
    if (mirroredIds.has(String(agent._id))) continue;
    try {
      await AgentReferralCode.create({ agentId: agent._id, code: agent.code, agentName: agent.name });
      summary.backfilled += 1;
    } catch (err) {
      if (err.code === 11000) continue; // mirrored by a concurrent run
      summary.failed += 1;
    }
  }

  return summary;
}
