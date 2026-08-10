import Joi from 'joi';

export const createAgentSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().trim().allow('').default(''),
}).unknown(false);

export const updateAgentSchema = Joi.object({
  name: Joi.string().trim(),
  email: Joi.string().email().lowercase().trim(),
  password: Joi.string().min(6),
  phone: Joi.string().trim().allow(''),
  active: Joi.boolean(),
}).unknown(false).min(1);
