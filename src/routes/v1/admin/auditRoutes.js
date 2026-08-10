import express from 'express';
import { listAuditLogs } from '../../../controllers/admin/auditController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';

const router = express.Router();

router.get('/', requirePermission('audit.view'), listAuditLogs);

export default router;
