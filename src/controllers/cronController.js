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
 * writes CommissionRecords idempotently. Triggered by Vercel Cron every 30
 * minutes (see vercel.json) — a few minutes' lag is acceptable, per spec.
 */
export const commissionAccrualCron = async (req, res) => {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const summary = await accrueCommissions();
  res.json({ success: true, data: summary });
};
