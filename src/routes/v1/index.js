import express from 'express';
import adminRoutes from './admin/index.js';
import agentRoutes from './agent/index.js';
import cronRoutes from './cronRoutes.js';
import publicRoutes from './publicRoutes.js';

const router = express.Router();

router.use('/admin', adminRoutes);
router.use('/agent', agentRoutes);
router.use('/cron', cronRoutes);
router.use('/public', publicRoutes);

export default router;
