import Joi from 'joi';

export const cancelReferralPayoutSchema = Joi.object({
  reason: Joi.string().trim().required(),
}).unknown(false);
