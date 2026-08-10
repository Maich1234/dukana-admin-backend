import express from 'express';
import { listCommissionRules, createCommissionRule, updateCommissionRule } from '../../../controllers/admin/commissionRulesController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { createCommissionRuleSchema, updateCommissionRuleSchema } from '../../../validations/commissionValidation.js';

const router = express.Router();

router.get('/', requirePermission('commissions.view'), listCommissionRules);
router.post('/', requirePermission('commissions.manage'), validate(createCommissionRuleSchema), createCommissionRule);
router.patch('/:id', requirePermission('commissions.manage'), validate(updateCommissionRuleSchema), updateCommissionRule);

export default router;
