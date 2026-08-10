import express from 'express';
import { listRoles, createRole, updateRole, deleteRole } from '../../../controllers/admin/rolesController.js';
import { requireSuperAdmin } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { createRoleSchema, updateRoleSchema } from '../../../validations/roleValidation.js';

const router = express.Router();

// Role CRUD is requireSuperAdmin-only outright — not permission-gated at
// all, per the plan's RBAC design.
router.use(requireSuperAdmin);

router.get('/', listRoles);
router.post('/', validate(createRoleSchema), createRole);
router.patch('/:id', validate(updateRoleSchema), updateRole);
router.delete('/:id', deleteRole);

export default router;
