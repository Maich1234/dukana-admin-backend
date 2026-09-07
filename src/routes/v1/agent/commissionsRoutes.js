import express from 'express';
import { listOwnCommissions, requestCommissionPayout } from '../../../controllers/agent/commissionsController.js';

const router = express.Router();

router.get('/', listOwnCommissions);
// The only mutation an agent can make to their own commissions: flag an
// approved record for payout. Approve/pay/cancel stay admin-only.
router.post('/:id/redeem', requestCommissionPayout);

export default router;
