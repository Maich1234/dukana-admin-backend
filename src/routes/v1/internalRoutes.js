import express from 'express';
import { protectInternal } from '../../middlewares/internalAuth.js';
import { receiveCommissionPayoutResult } from '../../controllers/internal/commissionPayoutsController.js';

const router = express.Router();

// Service-to-service only — called by smart-duka-backend, the reverse
// direction of services/internalApiClient.js's existing calls INTO that
// service.
router.use(protectInternal);

router.post('/commission-payouts/result', receiveCommissionPayoutResult);

export default router;
