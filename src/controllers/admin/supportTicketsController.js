import SupportTicket from '../../models/admin/SupportTicket.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';

/** GET /admin/support-tickets */
export const listSupportTickets = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.shopId) filter.shopId = req.query.shopId;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter).populate('assignedTo', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    SupportTicket.countDocuments(filter),
  ]);
  res.json({ success: true, data: tickets, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/**
 * POST /admin/support-tickets — V1 tickets are admin/agent-created only (no
 * shop-owner self-serve submission form, deferred to V2).
 */
export const createSupportTicket = async (req, res) => {
  const ticket = await SupportTicket.create({ ...req.body, createdBy: req.admin._id });

  logAudit({
    shopId: ticket.shopId ?? undefined,
    adminId: req.admin._id,
    action: 'admin.support_ticket.created',
    entityType: 'SupportTicket',
    entityId: ticket._id,
    details: { subject: ticket.subject, priority: ticket.priority },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: ticket });
};

/** GET /admin/support-tickets/:id */
export const getSupportTicket = async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate('assignedTo', 'name email')
    .populate('resolvedBy', 'name email')
    .populate('internalNotes.authorId', 'name email');
  if (!ticket) return res.status(404).json({ success: false, message: 'Support ticket not found' });
  res.json({ success: true, data: ticket });
};

/** PATCH /admin/support-tickets/:id */
export const updateSupportTicket = async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: 'Support ticket not found' });

  Object.assign(ticket, req.body);
  await ticket.save();

  logAudit({
    shopId: ticket.shopId ?? undefined,
    adminId: req.admin._id,
    action: 'admin.support_ticket.updated',
    entityType: 'SupportTicket',
    entityId: ticket._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: ticket });
};

/** PATCH /admin/support-tickets/:id/assign */
export const assignSupportTicket = async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: 'Support ticket not found' });

  ticket.assignedTo = req.body.assignedTo;
  await ticket.save();

  logAudit({
    shopId: ticket.shopId ?? undefined,
    adminId: req.admin._id,
    action: 'admin.support_ticket.assigned',
    entityType: 'SupportTicket',
    entityId: ticket._id,
    details: { assignedTo: req.body.assignedTo },
    req,
  }).catch(() => {});

  res.json({ success: true, data: ticket });
};

/** PATCH /admin/support-tickets/:id/status */
export const updateSupportTicketStatus = async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: 'Support ticket not found' });

  const previousStatus = ticket.status;
  ticket.status = req.body.status;
  if (req.body.status === 'resolved' && previousStatus !== 'resolved') {
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = req.admin._id;
  }
  await ticket.save();

  logAudit({
    shopId: ticket.shopId ?? undefined,
    adminId: req.admin._id,
    action: 'admin.support_ticket.status_changed',
    entityType: 'SupportTicket',
    entityId: ticket._id,
    details: { from: previousStatus, to: ticket.status },
    req,
  }).catch(() => {});

  res.json({ success: true, data: ticket });
};

/** POST /admin/support-tickets/:id/notes */
export const addSupportTicketNote = async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: 'Support ticket not found' });

  ticket.internalNotes.push({ authorId: req.admin._id, body: req.body.body, createdAt: new Date() });
  await ticket.save();

  logAudit({
    shopId: ticket.shopId ?? undefined,
    adminId: req.admin._id,
    action: 'admin.support_ticket.note_added',
    entityType: 'SupportTicket',
    entityId: ticket._id,
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: ticket });
};
