import express from 'express';
import {
  listSupportTickets, createSupportTicket, getSupportTicket, updateSupportTicket,
  assignSupportTicket, updateSupportTicketStatus, addSupportTicketNote,
} from '../../../controllers/admin/supportTicketsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import {
  createSupportTicketSchema, updateSupportTicketSchema, assignSupportTicketSchema,
  updateSupportTicketStatusSchema, addSupportTicketNoteSchema,
} from '../../../validations/supportTicketValidation.js';

const router = express.Router();

router.get('/', requirePermission('support.view'), listSupportTickets);
router.get('/:id', requirePermission('support.view'), getSupportTicket);
router.post('/', requirePermission('support.manage'), validate(createSupportTicketSchema), createSupportTicket);
router.patch('/:id', requirePermission('support.manage'), validate(updateSupportTicketSchema), updateSupportTicket);
router.patch('/:id/assign', requirePermission('support.manage'), validate(assignSupportTicketSchema), assignSupportTicket);
router.patch('/:id/status', requirePermission('support.manage'), validate(updateSupportTicketStatusSchema), updateSupportTicketStatus);
router.post('/:id/notes', requirePermission('support.manage'), validate(addSupportTicketNoteSchema), addSupportTicketNote);

export default router;
