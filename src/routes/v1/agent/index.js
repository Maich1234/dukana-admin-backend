import express from 'express';
import authRoutes from './authRoutes.js';
import onboardingRoutes from './onboardingRoutes.js';
import commissionsRoutes from './commissionsRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import { protectAgent } from '../../../middlewares/agentAuth.js';

const router = express.Router();

router.use('/auth', authRoutes);

router.use(protectAgent);

router.use('/onboarding', onboardingRoutes);
router.use('/commissions', commissionsRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
