import Joi from 'joi';

/** Shared body shape for every PATCH .../suspend route (admins, agents, shops). */
export const suspendReasonSchema = Joi.object({
  reason: Joi.string().trim().allow('').optional(),
}).unknown(false);
