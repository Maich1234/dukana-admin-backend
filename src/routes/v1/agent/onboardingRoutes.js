import express from 'express';
import { listOnboarding, getOnboarding, updateOnboarding, recordTraining, recordOnboardingPayment } from '../../../controllers/agent/onboardingController.js';
import { requireAssignedOnboarding } from '../../../middlewares/agentAuth.js';
import validate from '../../../middlewares/validate.js';
import { agentUpdateOnboardingSchema, recordTrainingSchema, recordOnboardingPaymentSchema } from '../../../validations/onboardingValidation.js';

const router = express.Router();

router.get('/', listOnboarding);
router.put('/:id/training', requireAssignedOnboarding, validate(recordTrainingSchema), recordTraining);
router.post('/:id/payment', requireAssignedOnboarding, validate(recordOnboardingPaymentSchema), recordOnboardingPayment);
router.get('/:id', requireAssignedOnboarding, getOnboarding);
router.patch('/:id', requireAssignedOnboarding, validate(agentUpdateOnboardingSchema), updateOnboarding);

export default router;
