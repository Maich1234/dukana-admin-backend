import Joi from 'joi';
import { objectId } from './objectId.js';

export const createOnboardingSchema = Joi.object({
  agentId: objectId().required(),
  leadName: Joi.string().trim().allow('').default(''),
  leadPhone: Joi.string().trim().allow('').default(''),
  leadEmail: Joi.string().email().lowercase().trim().allow('').default(''),
  leadNotes: Joi.string().trim().allow('').default(''),
}).unknown(false);

// Covers lead-info edits, stage advancement, and linking a shop once it's
// been found via GET /shops/lookup?email= (there is no signup webhook in
// V1 — see onboardingController.js). `shopId` is only ever set once
// (schema-level sparse-unique index on Onboarding.shopId enforces one shop
// per onboarding row); the controller rejects re-linking an already-linked
// row rather than silently overwriting it.
export const updateOnboardingSchema = Joi.object({
  leadName: Joi.string().trim().allow(''),
  leadPhone: Joi.string().trim().allow(''),
  leadEmail: Joi.string().email().lowercase().trim().allow(''),
  leadNotes: Joi.string().trim().allow(''),
  stage: Joi.string().valid('lead', 'registered', 'onboarding'),
  shopId: objectId(),
}).unknown(false).min(1);

// Agents may only ever touch lead info — never stage or shopId (those are
// admin-managed / display-derived respectively). See
// controllers/agent/onboardingController.js.
export const agentUpdateOnboardingSchema = Joi.object({
  leadName: Joi.string().trim().allow(''),
  leadPhone: Joi.string().trim().allow(''),
  leadEmail: Joi.string().email().lowercase().trim().allow(''),
  leadNotes: Joi.string().trim().allow(''),
}).unknown(false).min(1);

export const reassignOnboardingSchema = Joi.object({
  agentId: objectId().required(),
  reason: Joi.string().trim().allow('').default(''),
}).unknown(false);
