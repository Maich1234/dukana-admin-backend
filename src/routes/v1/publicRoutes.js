import express from 'express';
import { getPublicAgent } from '../../controllers/publicController.js';

const router = express.Router();

// Deliberately no protectAdmin/protectAgent here — this whole router is
// reachable by anyone who scans a printed tag's QR code.
router.get('/agents/:token', getPublicAgent);

export default router;
