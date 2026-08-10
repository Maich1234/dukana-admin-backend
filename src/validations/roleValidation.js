import Joi from 'joi';
import { PERMISSION_VALUES } from '../constants/permissions.js';

export const createRoleSchema = Joi.object({
  slug: Joi.string().lowercase().trim().pattern(/^[a-z0-9_-]+$/).required().messages({
    'string.pattern.base': 'Slug may only contain lowercase letters, numbers, hyphens and underscores.',
  }),
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow('').default(''),
  permissions: Joi.array().items(Joi.string().valid(...PERMISSION_VALUES)).default([]),
}).unknown(false);

// No defaults — a PATCH only ever contains what the caller actually sent.
// isSystemRole is never settable from the API (only the seed script can
// create a system role) — routes reject edits to an existing system role
// outright before validation even runs, but omitting it here too closes off
// "create a normal role then flip it to system" as an escalation path.
export const updateRoleSchema = Joi.object({
  slug: Joi.string().lowercase().trim().pattern(/^[a-z0-9_-]+$/),
  name: Joi.string().trim(),
  description: Joi.string().trim().allow(''),
  permissions: Joi.array().items(Joi.string().valid(...PERMISSION_VALUES)),
}).unknown(false).min(1);
