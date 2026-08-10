import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { listPlans, createPlan, updatePlan } from '../../../controllers/admin/settings/plansController.js';
import { listPromotions, createPromotion, updatePromotion } from '../../../controllers/admin/settings/promotionsController.js';
import { listPushCampaigns, createPushCampaign, sendPushCampaign, cancelPushCampaign } from '../../../controllers/admin/settings/pushCampaignsController.js';
import {
  getPlatformConfig, updatePlatformConfig, getPlatformConfigApprovers, updatePlatformConfigApprovers,
} from '../../../controllers/admin/settings/platformConfigController.js';
import { requestVerification, verifyCode } from '../../../controllers/admin/settings/platformConfigVerificationController.js';
import { requirePermission, requireSuperAdmin } from '../../../middlewares/adminAuth.js';
import { requirePlatformConfigVerification, requirePlatformConfigVerificationAlways } from '../../../services/platformConfigVerificationService.js';
import validate from '../../../middlewares/validate.js';
import { createRateLimitStore } from '../../../utils/rateLimitStore.js';
import {
  createPlanSchema, updatePlanSchema, createPromotionSchema, updatePromotionSchema,
  createPushCampaignSchema, updatePlatformConfigSchema, updatePlatformConfigApproversSchema, verifyPlatformConfigSchema,
} from '../../../validations/settingsValidation.js';

const router = express.Router();

// One module-group permission for the whole Settings surface (Plans/
// Promotions/Push/Platform Config) — see the plan's `settings.manage`
// addition to the fixed permission list.
router.use(requirePermission('settings.manage'));

router.get('/plans', listPlans);
router.post('/plans', validate(createPlanSchema), createPlan);
router.patch('/plans/:id', validate(updatePlanSchema), updatePlan);

router.get('/promotions', listPromotions);
router.post('/promotions', validate(createPromotionSchema), createPromotion);
router.patch('/promotions/:id', validate(updatePromotionSchema), updatePromotion);

router.get('/push-campaigns', listPushCampaigns);
router.post('/push-campaigns', validate(createPushCampaignSchema), createPushCampaign);
router.post('/push-campaigns/:id/send', sendPushCampaign);
router.patch('/push-campaigns/:id/cancel', cancelPushCampaign);

// Tighter than the login limiter — each request emails a human approver
// rather than the requester's own channel, so bursts are both an abuse
// vector and a way to spam the approver's inbox.
const platformConfigVerifyRequestLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.admin?._id?.toString() ?? ipKeyGenerator(req),
  store: createRateLimitStore('platform-config-verify-request'),
  skipFailedRequests: true,
  message: { success: false, message: 'Too many verification requests. Please wait 30 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const platformConfigVerifyVerifyLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 8,
  keyGenerator: (req) => req.admin?._id?.toString() ?? ipKeyGenerator(req),
  store: createRateLimitStore('platform-config-verify-verify'),
  message: { success: false, message: 'Too many verification attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Platform Config holds Dukana's own Daraja/Paystack credentials plus the
// approver emails that gate changing them — restricted to super_admin
// specifically, not just settings.manage. Unlike Plans/Promotions/Push,
// even *viewing* that credentials are configured or who approves changes to
// them is sensitive enough that a normal settings.manage admin should never
// see this surface at all, so the gate sits in front of every route below
// (GET included), not just the writes.
router.use('/platform-config', requireSuperAdmin);

router.post('/platform-config/verification/request', platformConfigVerifyRequestLimiter, requestVerification);
router.post('/platform-config/verification/verify', platformConfigVerifyVerifyLimiter, validate(verifyPlatformConfigSchema), verifyCode);
router.get('/platform-config', getPlatformConfig);
router.patch('/platform-config', requirePlatformConfigVerification, validate(updatePlatformConfigSchema), updatePlatformConfig);

// Approver emails (CEO / approved) that receive the step-up code above. A
// fresh approval code is required on top of super_admin for the PATCH —
// even a super admin can't change who approves without approval from an
// existing approver first. See platformConfigController.js and
// platformConfigSchema.js.
router.get('/platform-config/approvers', getPlatformConfigApprovers);
router.patch(
  '/platform-config/approvers',
  requirePlatformConfigVerificationAlways,
  validate(updatePlatformConfigApproversSchema),
  updatePlatformConfigApprovers
);

export default router;
