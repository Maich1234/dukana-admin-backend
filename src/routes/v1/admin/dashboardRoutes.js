import express from 'express';
import { getDashboard } from '../../../controllers/admin/dashboardController.js';

const router = express.Router();

// No fixed permission — protectAdmin (applied by the parent router) is
// enough; the controller itself omits any widget the caller lacks the
// underlying view permission for.
router.get('/', getDashboard);

export default router;
