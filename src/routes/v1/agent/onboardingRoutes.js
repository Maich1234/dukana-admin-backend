import express from 'express';
import { listOnboarding, getOnboarding, updateOnboarding } from '../../../controllers/agent/onboardingController.js';
import { requireAssignedOnboarding } from '../../../middlewares/agentAuth.js';
import validate from '../../../middlewares/validate.js';
import { agentUpdateOnboardingSchema } from '../../../validations/onboardingValidation.js';

const router = express.Router();

router.get('/', listOnboarding);
router.get('/:id', requireAssignedOnboarding, getOnboarding);
router.patch('/:id', requireAssignedOnboarding, validate(agentUpdateOnboardingSchema), updateOnboarding);

export default router;
