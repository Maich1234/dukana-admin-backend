import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, refresh, logout, getProfile, uploadOwnPhoto } from '../../../controllers/agent/authController.js';
import { protectAgent } from '../../../middlewares/agentAuth.js';
import validate from '../../../middlewares/validate.js';
import { createRateLimitStore } from '../../../utils/rateLimitStore.js';
import { agentLoginSchema, refreshTokenSchema, logoutSchema } from '../../../validations/authValidation.js';
import upload from '../../../middlewares/upload.js';

const router = express.Router();

const loginLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: createRateLimitStore('agent-login'),
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, validate(agentLoginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', validate(logoutSchema), logout);
router.get('/me', protectAgent, getProfile);
router.post('/me/photo', protectAgent, upload.single('photo'), uploadOwnPhoto);

export default router;
