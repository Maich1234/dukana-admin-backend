import Joi from 'joi';

// Allow-listed fields only — isActive/owner/paymentMethods stay
// owner-controlled in smart-duka-web and are deliberately absent here, both
// from this schema (Joi strips unknown fields — see middlewares/validate.js)
// and from the controller's own explicit field picks as a second layer.
export const updateShopSchema = Joi.object({
  name: Joi.string().trim(),
  phone: Joi.string().trim().allow(''),
  email: Joi.string().email().trim().allow(''),
  address: Joi.string().trim().allow(''),
  county: Joi.string().trim().allow(''),
  subCounty: Joi.string().trim().allow(''),
  taxRate: Joi.number().min(0),
  currency: Joi.string().uppercase().trim(),
}).unknown(false).min(1);

// Support-granted breathing room for one shop, capped at 30 days so a
// mis-typed value can't hand out a free year. Mirrors
// smart-duka-backend's grantGraceExtensionSchema exactly.
export const grantGraceExtensionSchema = Joi.object({
  days: Joi.number().integer().min(0).max(30).required(),
  reason: Joi.string().max(200).allow('').optional(),
}).unknown(false);
