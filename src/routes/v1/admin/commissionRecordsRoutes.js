import express from 'express';
import {
  listCommissionRecords, getCommissionRecord, approveCommissionRecord,
  payCommissionRecord, cancelCommissionRecord,
} from '../../../controllers/admin/commissionRecordsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { cancelCommissionRecordSchema } from '../../../validations/commissionValidation.js';

const router = express.Router();

router.get('/', requirePermission('commissions.view'), listCommissionRecords);
router.get('/:id', requirePermission('commissions.view'), getCommissionRecord);
// approve/pay both "release money" — same gate, per the plan.
router.patch('/:id/approve', requirePermission('commissions.approve'), approveCommissionRecord);
router.patch('/:id/pay', requirePermission('commissions.approve'), payCommissionRecord);
router.patch('/:id/cancel', requirePermission('commissions.manage'), validate(cancelCommissionRecordSchema), cancelCommissionRecord);

export default router;
