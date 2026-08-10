import Joi from 'joi';

// Financial values are never client-computed: commissionAmount/ruleValue on
// a *record* are never accepted from a request body anywhere in this file —
// only a CommissionRule's own `value` (the policy) is ever client-supplied,
// and CommissionRecord.commissionAmount is always server-computed by
// commissionAccrualService. See validations/README-equivalent note in the
// plan's security review (Phase 6, item 7).
export const createCommissionRuleSchema = Joi.object({
  name: Joi.string().trim().required(),
  type: Joi.string().valid('percentage', 'fixed').required(),
  value: Joi.number().min(0).when('type', {
    is: 'percentage',
    then: Joi.number().max(100),
  }).required(),
  transactionType: Joi.string().valid('subscription_payment').default('subscription_payment'),
  planSlugs: Joi.array().items(Joi.string().trim()).default([]),
  billingCycles: Joi.array().items(Joi.string().valid('monthly', 'yearly')).default([]),
  startDate: Joi.date().allow(null).default(null),
  endDate: Joi.date().allow(null).default(null),
  status: Joi.string().valid('active', 'inactive').default('active'),
}).unknown(false);

// No delete endpoint for CommissionRule — only this status toggle, plus
// ordinary field edits. No defaults, same reasoning as every other
// update-schema in this app: a PATCH only ever contains what was sent.
//
// `value` is deliberately NOT capped at 100 here the way createCommissionRuleSchema
// caps it — a PATCH that only sends `value` has no idea whether the rule's
// (unsent, existing) type is 'percentage' or 'fixed' at validation time, and
// capping unconditionally would wrongly reject a legitimate fixed-amount
// value over 100. The controller re-checks value <= 100 against the
// resulting (existing-or-updated) type before saving.
export const updateCommissionRuleSchema = Joi.object({
  name: Joi.string().trim(),
  type: Joi.string().valid('percentage', 'fixed'),
  value: Joi.number().min(0),
  transactionType: Joi.string().valid('subscription_payment'),
  planSlugs: Joi.array().items(Joi.string().trim()),
  billingCycles: Joi.array().items(Joi.string().valid('monthly', 'yearly')),
  startDate: Joi.date().allow(null),
  endDate: Joi.date().allow(null),
  status: Joi.string().valid('active', 'inactive'),
}).unknown(false).min(1);

export const cancelCommissionRecordSchema = Joi.object({
  reason: Joi.string().trim().required(),
}).unknown(false);
