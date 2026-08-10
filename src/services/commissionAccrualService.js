import { getSmartDukaModels } from '../models/smartduka/index.js';
import Onboarding from '../models/admin/Onboarding.js';
import CommissionRule from '../models/admin/CommissionRule.js';
import CommissionRecord from '../models/admin/CommissionRecord.js';

// Cron-driven accrual: reads successful SubscriptionPayments (secondary
// connection), matches each payment's shop to an agent via Onboarding
// (primary connection), applies the best-matching active CommissionRule, and
// writes a CommissionRecord. A few minutes' lag between payment and accrual
// is acceptable — this is not real-time accounting, per the product spec.
//
// Bounded to a lookback window so the query stays cheap as SubscriptionPayment
// grows — commission accrual only ever needs to catch payments the cron
// hasn't seen yet, not the platform's entire payment history.
const LOOKBACK_DAYS = 14;

/**
 * Picks the single best CommissionRule for one payment, or null. Precedence
 * (most specific wins, since the plan doesn't define one and this is the
 * least surprising default): a rule scoped to this exact plan slug beats a
 * rule that applies to every plan; among ties, a rule scoped to this exact
 * billing cycle beats one that applies to both; among further ties, the most
 * recently created rule wins.
 */
function pickMatchingRule(rules, { planSlug, billingCycle, when }) {
  const eligible = rules.filter((rule) => {
    if (rule.status !== 'active') return false;
    if (rule.startDate && when < rule.startDate) return false;
    if (rule.endDate && when > rule.endDate) return false;
    if (rule.planSlugs?.length && !rule.planSlugs.includes(planSlug)) return false;
    if (rule.billingCycles?.length && !rule.billingCycles.includes(billingCycle)) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const score = (rule) => (rule.planSlugs?.length ? 2 : 0) + (rule.billingCycles?.length ? 1 : 0);
  eligible.sort((a, b) => {
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return eligible[0];
}

function computeCommissionAmount(rule, amount) {
  if (rule.type === 'percentage') return Math.round((amount * rule.value) / 100);
  return Math.round(rule.value);
}

/**
 * Runs one accrual pass. Returns a summary object for the cron log/response.
 * Safe to call repeatedly (triggered once daily via Vercel Cron — see
 * vercel.json) — already-accrued payments are skipped via a pre-check and,
 * as a last-resort guard against a race between two concurrent runs, the
 * CommissionRecord unique compound index makes a duplicate write a no-op
 * rather than a double-pay.
 */
export async function accrueCommissions() {
  const { SubscriptionPayment } = await getSmartDukaModels();

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const payments = await SubscriptionPayment.find({
    status: 'success',
    createdAt: { $gte: since },
  })
    .populate('plan', 'slug')
    .lean();

  const summary = { scanned: payments.length, accrued: 0, skipped: 0, failed: 0, errors: [] };
  if (payments.length === 0) return summary;

  const paymentIds = payments.map((p) => p._id);
  const alreadyAccrued = await CommissionRecord.find({
    sourceTransactionType: 'subscription_payment',
    sourceTransactionId: { $in: paymentIds },
  }).select('sourceTransactionId').lean();
  const accruedIds = new Set(alreadyAccrued.map((r) => String(r.sourceTransactionId)));

  const pending = payments.filter((p) => !accruedIds.has(String(p._id)));
  if (pending.length === 0) {
    summary.skipped = payments.length;
    return summary;
  }

  const shopIds = [...new Set(pending.map((p) => String(p.shop)))];
  const onboardings = await Onboarding.find({ shopId: { $in: shopIds } });
  const onboardingByShopId = new Map(onboardings.map((o) => [String(o.shopId), o]));

  const activeRules = await CommissionRule.find({ status: 'active', transactionType: 'subscription_payment' }).lean();

  for (const payment of pending) {
    const onboarding = onboardingByShopId.get(String(payment.shop));
    if (!onboarding) {
      // This shop wasn't brought on by an agent (or isn't linked yet) —
      // nothing to accrue.
      summary.skipped += 1;
      continue;
    }

    const rule = pickMatchingRule(activeRules, {
      planSlug: payment.plan?.slug,
      billingCycle: payment.billingCycle,
      when: payment.transactionDate ?? payment.createdAt,
    });
    if (!rule) {
      summary.skipped += 1;
      continue;
    }

    try {
      await CommissionRecord.create({
        agentId: onboarding.agentId,
        shopId: payment.shop,
        onboardingId: onboarding._id,
        sourceTransactionType: 'subscription_payment',
        sourceTransactionId: payment._id,
        originalAmount: payment.amount,
        currency: payment.currency,
        ruleId: rule._id,
        ruleType: rule.type,
        ruleValue: rule.value,
        commissionAmount: computeCommissionAmount(rule, payment.amount),
        status: 'pending',
      });
      summary.accrued += 1;

      // First revenue event for this onboarding — the natural, unambiguous
      // moment to record when the shop actually became an active, paying
      // customer (distinct from `stage`, which is display-derived live from
      // Subscription.status — see onboardingService.js).
      if (!onboarding.becameActiveAt) {
        onboarding.becameActiveAt = payment.transactionDate ?? payment.createdAt;
        await onboarding.save();
      }
    } catch (err) {
      if (err.code === 11000) {
        // Lost a race with a concurrent accrual run — already recorded.
        summary.skipped += 1;
        continue;
      }
      summary.failed += 1;
      summary.errors.push(`payment ${payment._id}: ${err.message}`);
    }
  }

  return summary;
}
