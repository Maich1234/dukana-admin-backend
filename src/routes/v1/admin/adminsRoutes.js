import express from 'express';
import { listAdmins, createAdmin, updateAdmin, suspendAdmin, reactivateAdmin } from '../../../controllers/admin/adminsController.js';
import { requirePermission, requireSuperAdminForRoleChange } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { createAdminUserSchema, updateAdminUserSchema } from '../../../validations/adminUserValidation.js';
import { suspendReasonSchema } from '../../../validations/common.js';

const router = express.Router();

router.get('/', requirePermission('admins.view'), listAdmins);
router.post('/', requirePermission('admins.create'), requireSuperAdminForRoleChange, validate(createAdminUserSchema), createAdmin);
router.patch('/:id', requirePermission('admins.edit'), requireSuperAdminForRoleChange, validate(updateAdminUserSchema), updateAdmin);
router.patch('/:id/suspend', requirePermission('admins.suspend'), validate(suspendReasonSchema), suspendAdmin);
router.patch('/:id/reactivate', requirePermission('admins.suspend'), reactivateAdmin);

export default router;
