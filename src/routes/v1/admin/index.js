import express from 'express';
import authRoutes from './authRoutes.js';
import adminsRoutes from './adminsRoutes.js';
import rolesRoutes from './rolesRoutes.js';
import shopsRoutes from './shopsRoutes.js';
import agentsRoutes from './agentsRoutes.js';
import onboardingRoutes from './onboardingRoutes.js';
import subscriptionsRoutes from './subscriptionsRoutes.js';
import paymentsRoutes from './paymentsRoutes.js';
import commissionRulesRoutes from './commissionRulesRoutes.js';
import commissionRecordsRoutes from './commissionRecordsRoutes.js';
import supportTicketsRoutes from './supportTicketsRoutes.js';
import auditRoutes from './auditRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import { listPermissions } from '../../../controllers/admin/rolesController.js';
import { protectAdmin, requireSuperAdmin } from '../../../middlewares/adminAuth.js';

const router = express.Router();

// Login/refresh/logout are unauthenticated by nature; GET /auth/me is
// protected inside authRoutes.js itself.
router.use('/auth', authRoutes);

// Everything below requires a valid admin session.
router.use(protectAdmin);

router.use('/admins', adminsRoutes);
router.use('/roles', rolesRoutes);
// Feeds the Roles UI checkbox list — same requireSuperAdmin gate as role
// management itself, kept top-level (not under /roles) to match the plan's
// literal `GET /api/v1/admin/permissions` path.
router.get('/permissions', requireSuperAdmin, listPermissions);
router.use('/shops', shopsRoutes);
router.use('/agents', agentsRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/commission-rules', commissionRulesRoutes);
router.use('/commission-records', commissionRecordsRoutes);
router.use('/support-tickets', supportTicketsRoutes);
router.use('/audit', auditRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);

export default router;
