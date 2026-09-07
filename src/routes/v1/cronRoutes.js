import express from 'express';
import { commissionAccrualCron, reconcileB2cPayouts } from '../../controllers/cronController.js';

const router = express.Router();

// No auth middleware — triggered by Vercel Cron, not a logged-in principal.
// The handler verifies CRON_SECRET itself (see cronController.js).
router.get('/commission-accrual', commissionAccrualCron);
router.get('/reconcile-b2c-payouts', reconcileB2cPayouts);

export default router;
