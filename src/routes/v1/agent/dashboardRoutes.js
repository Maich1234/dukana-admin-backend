import express from 'express';
import { getDashboard } from '../../../controllers/agent/dashboardController.js';

const router = express.Router();

router.get('/', getDashboard);

export default router;
