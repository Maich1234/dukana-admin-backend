import Joi from 'joi';

// Plans, Promotions, Push Campaigns, Platform Config — ported near-verbatim
// from smart-duka-backend/src/validations/adminValidation.js, since these
// operate on the same SubscriptionPlan/Promotion/PushCampaign/PlatformConfig
// shapes (bound here via the secondary connection — see
// models/smartduka/index.js).

export const createPlanSchema = Joi.object({
  slug: Joi.string().lowercase().trim().required(),
  name: Joi.string().trim().required(),
  tagline: Joi.string().trim().allow('').default(''),
  description: Joi.string().trim().allow('').default(''),
  billingType: Joi.string().valid('per_staff', 'flat').required(),
  monthlyPrice: Joi.number().min(0).required(),
  yearlyDiscountPercent: Joi.number().min(0).max(100).default(20),
  yearlyPrice: Joi.number().min(0).allow(null).default(null),
  maxStaff: Joi.number().min(1).required(),
  extraStaffPrice: Joi.number().min(0).default(0),
  trialDays: Joi.number().min(0).default(30),
  currency: Joi.string().uppercase().trim().default('KES'),
  highlights: Joi.array().items(Joi.string()).default([]),
  features: Joi.array().items(Joi.string()).default([]),
  badge: Joi.string().trim().allow('').default(''),
  priceComparison: Joi.string().trim().allow('').default(''),
  active: Joi.boolean().default(true),
  displayOrder: Joi.number().default(0),
  chatLimits: Joi.object({
    maxConversations: Joi.number().integer().min(0).allow(null).default(null),
    maxNewConversationsPerDay: Joi.number().integer().min(0).allow(null).default(null),
    maxMessagesPerDay: Joi.number().integer().min(0).allow(null).default(null),
  }).default({ maxConversations: null, maxNewConversationsPerDay: null, maxMessagesPerDay: null }),
}).unknown(false);

// Deliberately NOT derived from createPlanSchema via .fork() — see
// smart-duka-backend's identical comment: that schema's .default(...) values
// would apply to every *absent* key on a PATCH, not just missing required
// ones, silently overwriting every omitted field.
export const updatePlanSchema = Joi.object({
  slug: Joi.string().lowercase().trim(),
  name: Joi.string().trim(),
  tagline: Joi.string().trim().allow(''),
  description: Joi.string().trim().allow(''),
  billingType: Joi.string().valid('per_staff', 'flat'),
  monthlyPrice: Joi.number().min(0),
  yearlyDiscountPercent: Joi.number().min(0).max(100),
  yearlyPrice: Joi.number().min(0).allow(null),
  maxStaff: Joi.number().min(1),
  extraStaffPrice: Joi.number().min(0),
  trialDays: Joi.number().min(0),
  currency: Joi.string().uppercase().trim(),
  highlights: Joi.array().items(Joi.string()),
  features: Joi.array().items(Joi.string()),
  badge: Joi.string().trim().allow(''),
  priceComparison: Joi.string().trim().allow(''),
  active: Joi.boolean(),
  displayOrder: Joi.number(),
  chatLimits: Joi.object({
    maxConversations: Joi.number().integer().min(0).allow(null),
    maxNewConversationsPerDay: Joi.number().integer().min(0).allow(null),
    maxMessagesPerDay: Joi.number().integer().min(0).allow(null),
  }),
}).unknown(false).min(1);

export const createPromotionSchema = Joi.object({
  code: Joi.string().uppercase().trim().required(),
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow('').default(''),
  discountType: Joi.string().valid('percentage', 'fixed').required(),
  discountValue: Joi.number().min(0).required(),
  startsAt: Joi.date().allow(null).default(null),
  endsAt: Joi.date().allow(null).default(null),
  maxRedemptions: Joi.number().min(1).allow(null).default(null),
  active: Joi.boolean().default(true),
}).unknown(false);

export const updatePromotionSchema = Joi.object({
  code: Joi.string().uppercase().trim(),
  title: Joi.string().trim(),
  description: Joi.string().trim().allow(''),
  discountType: Joi.string().valid('percentage', 'fixed'),
  discountValue: Joi.number().min(0),
  startsAt: Joi.date().allow(null),
  endsAt: Joi.date().allow(null),
  maxRedemptions: Joi.number().min(1).allow(null),
  active: Joi.boolean(),
}).unknown(false).min(1);

const segmentSchema = Joi.object({
  type: Joi.string().valid('all', 'state', 'plan', 'location').required(),
  states: Joi.array().items(Joi.string().valid('none', 'trialing', 'active', 'grace', 'locked'))
    .when('type', { is: 'state', then: Joi.array().min(1).required(), otherwise: Joi.array().max(0) }),
  planSlugs: Joi.array().items(Joi.string())
    .when('type', { is: 'plan', then: Joi.array().min(1).required(), otherwise: Joi.array().max(0) }),
  country: Joi.string().uppercase()
    .when('type', { is: 'location', then: Joi.string().required(), otherwise: Joi.string().allow(null).default(null) }),
  counties: Joi.array().items(Joi.string())
    .when('type', { is: 'location', then: Joi.array().min(1).required(), otherwise: Joi.array().max(0) }),
  roles: Joi.array().items(Joi.string().valid('owner', 'staff')).min(1).default(['owner']),
}).unknown(false);

export const createPushCampaignSchema = Joi.object({
  title: Joi.string().trim().required(),
  body: Joi.string().trim().required(),
  data: Joi.object().pattern(Joi.string(), Joi.string()).default(undefined),
  segment: segmentSchema.required(),
  scheduledAt: Joi.date().allow(null).default(null),
}).unknown(false);

// PlatformConfig is always a partial update (secrets are only sent when
// actively being changed) — no defaults, for the same reason as
// updatePlanSchema.
export const updatePlatformConfigSchema = Joi.object({
  enabled: Joi.boolean(),
  environment: Joi.string().valid('sandbox', 'production'),
  businessName: Joi.string().trim().allow(''),
  shortcode: Joi.string().trim().allow(''),
  consumerKey: Joi.string().trim().allow(''),
  consumerSecret: Joi.string().trim().allow(''),
  passkey: Joi.string().trim().allow(''),
  paystackEnabled: Joi.boolean(),
  paystackPublicKey: Joi.string().trim().allow(''),
  paystackSecretKey: Joi.string().trim().allow(''),
  immediateSeatBilling: Joi.boolean(),
  gracePeriodDays: Joi.number().min(0),
  staffGraceExtraDays: Joi.number().min(0),
  reminderDaysBefore: Joi.array().items(Joi.number().min(0)),
}).unknown(false).min(1);

// ceoEmail is deliberately not a field here — it only ever comes from
// PLATFORM_CONFIG_APPROVER_EMAILS (env), so this endpoint has no write path
// for it at all, even for a super admin. Empty string is allowed so
// approvedEmail can be cleared back to "unset" (requestPlatformConfigVerification
// still has the env-sourced CEO email to fall back on).
export const updatePlatformConfigApproversSchema = Joi.object({
  approvedEmail: Joi.string().trim().lowercase().email().allow('').required(),
}).unknown(false);

export const verifyPlatformConfigSchema = Joi.object({
  sessionId: Joi.string().required(),
  code: Joi.string().pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': 'Verification code must be 6 digits',
  }),
}).unknown(false);

// notifyTitle/notifyBody are only required when notify is actually true —
// so "save the rate without notifying" can't be blocked by empty message
// fields the admin never intended to fill in, but "notify" can never fire
// with an empty title/body either.
export const updateReferralConfigSchema = Joi.object({
  enabled: Joi.boolean(),
  percentPerReferral: Joi.number().min(0).max(100),
  maxStackedPercent: Joi.number().min(0).max(100),
  notify: Joi.boolean().default(false),
  notifyTitle: Joi.string().trim().when('notify', { is: true, then: Joi.string().min(1).required(), otherwise: Joi.string().trim().allow('') }),
  notifyBody: Joi.string().trim().when('notify', { is: true, then: Joi.string().min(1).required(), otherwise: Joi.string().trim().allow('') }),
}).unknown(false);
