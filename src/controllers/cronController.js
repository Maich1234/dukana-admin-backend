import { accrueCommissions } from '../services/commissionAccrualService.js';
import { linkAgentReferralRedemptions } from '../services/agentReferralLinkService.js';
import { syncAgentReferralCodes } from '../services/agentReferralService.js';
import CommissionRecord from '../models/admin/CommissionRecord.js';
import { getSmartDukaModels } from '../models/smartduka/index.js';
import { logAudit } from '../services/auditLogService.js';

let warnedMissingCronSecret = false;

// Same CRON_SECRET-header pattern as smart-duka-backend's cronRoutes.js.
const verifyCronSecret = (req) => {
  if (!process.env.CRON_SECRET) {
    if (!warnedMissingCronSecret) {
      console.error('[cron] CRON_SECRET is not set on this server — every cron request will be rejected until it is configured.');
      warnedMissingCronSecret = true;
    }
    return false;
  }
  const provided = req.headers.authorization?.replace('Bearer ', '');
  return !!provided && provided === process.env.CRON_SECRET;
};

/**
 * GET /cron/commission-accrual — reads successful SubscriptionPayments,
 * matches shop→agent via Onboarding, applies active CommissionRules, and
 * writes CommissionRecords idempotently. Triggered once daily by Vercel Cron
 * (see vercel.json — Hobby-plan projects can't schedule sub-daily crons; a
 * day's lag between payment and accrual is acceptable, per spec). Each run
 * re-scans the full LOOKBACK_DAYS window and skips already-accrued payments,
 * so cadence only affects latency, never correctness.
 *
 * Two referral-linking steps run first, in the same daily pass rather than a
 * separate cron slot (Hobby-plan Vercel only allows so many): syncing any
 * agent referral code whose mirror write failed at creation time, and
 * linking any agent-code shop signup to its Onboarding row so the existing
 * accrual step below can pick it up exactly like a manually-linked shop.
 */
export const commissionAccrualCron = async (req, res) => {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const codeSyncSummary = await syncAgentReferralCodes();
  const linkSummary = await linkAgentReferralRedemptions();
  const summary = await accrueCommissions();
  res.json({ success: true, data: { codeSyncSummary, linkSummary, ...summary } });
};

/**
 * GET /cron/reconcile-b2c-payouts — backstop only. The primary path is
 * smart-duka-backend pushing a B2C result straight to
 * POST /internal/commission-payouts/result the moment Safaricom's callback
 * fires (near-instant); this exists purely for the rare case that push never
 * lands (network blip, this service cold-starting at the wrong moment).
 * Every CommissionRecord still 'paying' is checked against its matching
 * B2CTransaction (in smart-duka's DB, read via the existing cross-connection)
 * — if that side already knows the outcome, reconcile here and mark it
 * consumed there too, so this never reprocesses the same result twice.
 * Runs once daily via Vercel Cron (Hobby-plan limit) — fine for a backstop,
 * unlike if this were the primary mechanism.
 */
export const reconcileB2cPayouts = async (req, res) => {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const stuck = await CommissionRecord.find({ status: 'paying' });
  const { B2CTransaction } = await getSmartDukaModels();

  const results = [];
  for (const record of stuck) {
    try {
      const transaction = record.b2cConversationId
        ? await B2CTransaction.findOne({ conversationId: record.b2cConversationId })
        : null;
      if (!transaction || transaction.status === 'pending' || transaction.reconciledAt) continue;

      if (transaction.status === 'completed') {
        record.status = 'paid';
        record.paidAt = new Date();
      } else {
        record.status = 'approved';
        record.payoutFailureReason = transaction.resultDesc || 'The M-Pesa payout failed.';
      }
      await record.save();

      transaction.reconciledAt = new Date();
      await transaction.save();

      logAudit({
        shopId: record.shopId,
        action: transaction.status === 'completed' ? 'admin.commission_record.b2c_paid' : 'admin.commission_record.b2c_failed',
        entityType: 'CommissionRecord',
        entityId: record._id,
        details: { agentId: String(record.agentId), reconciledBy: 'cron' },
      }).catch(() => {});

      results.push({ record: String(record._id), status: record.status });
    } catch (err) {
      console.error('[cron reconcile-b2c-payouts] Failed to reconcile record', record._id, err.message);
    }
  }

  res.json({ success: true, checked: stuck.length, reconciled: results.length, results });
};
