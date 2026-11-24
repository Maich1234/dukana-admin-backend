import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, verifyLogin, refresh, logout, getProfile, recordActivity } from '../../../controllers/admin/authController.js';
import { protectAdmin } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { createRateLimitStore } from '../../../utils/rateLimitStore.js';
import { adminLoginSchema, adminVerifyLoginSchema, refreshTokenSchema, logoutSchema } from '../../../validations/authValidation.js';

const router = express.Router();

// Same brute-force protection convention as smart-duka-backend's admin
// login limiter — this is an exposed login endpoint for a money-and-access
// surface and deserves it.
const loginLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: createRateLimitStore('admin-login'),
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, validate(adminLoginSchema), login);
router.post('/login/verify', loginLimiter, validate(adminVerifyLoginSchema), verifyLogin);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', validate(logoutSchema), logout);
router.post('/activity', protectAdmin, recordActivity);
router.get('/me', protectAdmin, getProfile);

export default router;
