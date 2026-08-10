import Joi from 'joi';

export const adminLoginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
}).unknown(false);

export const agentLoginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
}).unknown(false);

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
}).unknown(false);

// Logout is deliberately best-effort/unauthenticated (see auth controllers)
// but still validated — an absent/garbage refreshToken is simply ignored by
// revokeRefreshToken, never a 500.
export const logoutSchema = Joi.object({
  refreshToken: Joi.string().allow('').optional(),
}).unknown(false);
