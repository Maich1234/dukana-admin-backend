import express from 'express';
import {
  listAgents, createAgent, getAgent, updateAgent, suspendAgent, reactivateAgent,
  getAgentShops, getAgentCommissions,
} from '../../../controllers/admin/agentsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { createAgentSchema, updateAgentSchema } from '../../../validations/agentValidation.js';
import { suspendReasonSchema } from '../../../validations/common.js';

const router = express.Router();

router.get('/', requirePermission('agents.view'), listAgents);
router.post('/', requirePermission('agents.create'), validate(createAgentSchema), createAgent);
router.get('/:id', requirePermission('agents.view'), getAgent);
router.patch('/:id', requirePermission('agents.edit'), validate(updateAgentSchema), updateAgent);
router.patch('/:id/suspend', requirePermission('agents.suspend'), validate(suspendReasonSchema), suspendAgent);
router.patch('/:id/reactivate', requirePermission('agents.suspend'), reactivateAgent);
router.get('/:id/shops', requirePermission('agents.view'), getAgentShops);
// GET .../commissions needs both agents.view (to look at this agent at all)
// and commissions.view (to see money figures) — two separate concerns per
// the plan's permission list.
router.get('/:id/commissions', requirePermission('agents.view'), requirePermission('commissions.view'), getAgentCommissions);

export default router;
