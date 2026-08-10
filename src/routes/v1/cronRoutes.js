import express from 'express';
import { commissionAccrualCron } from '../../controllers/cronController.js';

const router = express.Router();

// No auth middleware — triggered by Vercel Cron, not a logged-in principal.
// The handler verifies CRON_SECRET itself (see cronController.js).
router.get('/commission-accrual', commissionAccrualCron);

export default router;
