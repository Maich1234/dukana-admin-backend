import { accrueCommissions } from '../services/commissionAccrualService.js';

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
 */
export const commissionAccrualCron = async (req, res) => {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const summary = await accrueCommissions();
  res.json({ success: true, data: summary });
};
