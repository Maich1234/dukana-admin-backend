import express from 'express';
import adminRoutes from './admin/index.js';
import agentRoutes from './agent/index.js';
import cronRoutes from './cronRoutes.js';

const router = express.Router();

router.use('/admin', adminRoutes);
router.use('/agent', agentRoutes);
router.use('/cron', cronRoutes);

export default router;
