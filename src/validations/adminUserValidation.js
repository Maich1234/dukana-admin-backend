import Joi from 'joi';
import { objectId } from './objectId.js';

export const createAdminUserSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(6).required(),
  roleId: objectId().required(),
}).unknown(false);

// roleId is intentionally accepted here (not stripped) — the escalation
// guard lives in the route (requireSuperAdmin gates any request whose body
// contains roleId at all when the caller isn't a super admin — see
// adminsController.js), not in Joi. Stripping it here would make that guard
// unreachable dead code and give a confusing silent-no-op instead of a 403.
export const updateAdminUserSchema = Joi.object({
  name: Joi.string().trim(),
  email: Joi.string().email().lowercase().trim(),
  password: Joi.string().min(6),
  roleId: objectId(),
  active: Joi.boolean(),
}).unknown(false).min(1);

