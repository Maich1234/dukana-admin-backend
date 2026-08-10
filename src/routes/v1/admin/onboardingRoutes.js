import express from 'express';
import {
  listOnboarding, createOnboarding, getOnboarding, updateOnboarding,
  reassignOnboarding, deleteOnboarding,
} from '../../../controllers/admin/onboardingController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { createOnboardingSchema, updateOnboardingSchema, reassignOnboardingSchema } from '../../../validations/onboardingValidation.js';

const router = express.Router();

router.get('/', requirePermission('onboarding.view'), listOnboarding);
router.post('/', requirePermission('onboarding.manage'), validate(createOnboardingSchema), createOnboarding);
router.get('/:id', requirePermission('onboarding.view'), getOnboarding);
router.patch('/:id', requirePermission('onboarding.manage'), validate(updateOnboardingSchema), updateOnboarding);
router.post('/:id/reassign', requirePermission('onboarding.manage'), validate(reassignOnboardingSchema), reassignOnboarding);
router.delete('/:id', requirePermission('onboarding.manage'), deleteOnboarding);

export default router;
