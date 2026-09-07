import { getSmartDukaModels } from '../models/smartduka/index.js';
import Onboarding from '../models/admin/Onboarding.js';

/**
 * Cron-driven link step, run before accrueCommissions() in the same daily
 * pass (see cronController.js). smart-duka-backend's register.js writes an
 * AgentReferralRedemption row (its own DB) the moment a shop signs up with
 * an agent's code — it has no connection to create the Onboarding row
 * directly, so this is where that row actually gets created, in this
 * backend's own (admin-native) database.
 *
 * Idempotent the same way accrueCommissions() is: `linkedAt` is only ever
 * set once, and Onboarding.shopId carries its own unique-sparse index, so a
 * concurrent or repeated run can't double-link.
 */
export async function linkAgentReferralRedemptions() {
  const { AgentReferralRedemption, PlatformConfig } = await getSmartDukaModels();

  const platform = await PlatformConfig.get();
  const audience = platform.referral?.agent;
  const summary = { scanned: 0, linked: 0, skipped: 0, failed: 0, errors: [] };

  if (!audience?.enabled) return summary;
  const now = new Date();
  if (audience.startsAt && now < audience.startsAt) return summary;
  if (audience.endsAt && now > audience.endsAt) return summary;

  const redemptions = await AgentReferralRedemption.find({ linkedAt: null });
  summary.scanned = redemptions.length;

  for (const redemption of redemptions) {
    try {
      let onboarding = await Onboarding.findOne({ shopId: redemption.shopId });
      if (!onboarding) {
        onboarding = await Onboarding.create({
          shopId: redemption.shopId,
          agentId: redemption.agentId,
          stage: 'registered',
          registeredAt: redemption.redeemedAt,
        });
      }
      redemption.linkedAt = new Date();
      redemption.onboardingId = onboarding._id;
      await redemption.save();
      summary.linked += 1;
    } catch (err) {
      if (err.code === 11000) {
        // Lost a race with a concurrent run — already linked.
        summary.skipped += 1;
        continue;
      }
      summary.failed += 1;
      summary.errors.push(`redemption ${redemption._id}: ${err.message}`);
    }
  }

  return summary;
}
