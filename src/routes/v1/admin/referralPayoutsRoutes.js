import express from 'express';
import { listReferralPayouts, payReferralPayout, cancelReferralPayout } from '../../../controllers/admin/referralPayoutsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { cancelReferralPayoutSchema } from '../../../validations/referralPayoutValidation.js';

const router = express.Router();

router.get('/', requirePermission('referral_payouts.view'), listReferralPayouts);
router.patch('/:id/pay', requirePermission('referral_payouts.approve'), payReferralPayout);
router.patch('/:id/cancel', requirePermission('referral_payouts.approve'), validate(cancelReferralPayoutSchema), cancelReferralPayout);

export default router;
