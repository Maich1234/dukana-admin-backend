import express from 'express';
import { listOwnCommissions } from '../../../controllers/agent/commissionsController.js';

const router = express.Router();

// GET-only — no mutation routes at all for an agent's own commissions.
router.get('/', listOwnCommissions);

export default router;
