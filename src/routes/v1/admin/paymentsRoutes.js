import express from 'express';
import { listPayments } from '../../../controllers/admin/paymentsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';

const router = express.Router();

router.get('/', requirePermission('payments.view'), listPayments);

export default router;
