import CommissionRecord from '../../models/admin/CommissionRecord.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';

/** GET /admin/commission-records */
export const listCommissionRecords = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.agentId) filter.agentId = req.query.agentId;
  if (req.query.shopId) filter.shopId = req.query.shopId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
  }

  const [records, total] = await Promise.all([
    CommissionRecord.find(filter).populate('agentId', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    CommissionRecord.countDocuments(filter),
  ]);
  res.json({ success: true, data: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** GET /admin/commission-records/:id */
export const getCommissionRecord = async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id).populate('agentId', 'name email');
  if (!record) return res.status(404).json({ success: false, message: 'Commission record not found' });
  res.json({ success: true, data: record });
};

/** PATCH /admin/commission-records/:id/approve — pending → approved. */
export const approveCommissionRecord = async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Commission record not found' });
  if (record.status !== 'pending') {
    return res.status(409).json({ success: false, message: `Only a pending record can be approved (this one is ${record.status}).` });
  }

  record.status = 'approved';
  record.approvedBy = req.admin._id;
  record.approvedAt = new Date();
  await record.save();

  logAudit({
    shopId: record.shopId,
    adminId: req.admin._id,
    action: 'admin.commission_record.approved',
    entityType: 'CommissionRecord',
    entityId: record._id,
    details: { agentId: String(record.agentId), commissionAmount: record.commissionAmount },
    req,
  }).catch(() => {});

  res.json({ success: true, data: record });
};

/** PATCH /admin/commission-records/:id/pay — approved → paid. Same gate ("release money") as approve. */
export const payCommissionRecord = async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Commission record not found' });
  if (record.status !== 'approved') {
    return res.status(409).json({ success: false, message: `Only an approved record can be marked paid (this one is ${record.status}).` });
  }

  record.status = 'paid';
  record.paidBy = req.admin._id;
  record.paidAt = new Date();
  await record.save();

  logAudit({
    shopId: record.shopId,
    adminId: req.admin._id,
    action: 'admin.commission_record.paid',
    entityType: 'CommissionRecord',
    entityId: record._id,
    details: { agentId: String(record.agentId), commissionAmount: record.commissionAmount },
    req,
  }).catch(() => {});

  res.json({ success: true, data: record });
};

/** PATCH /admin/commission-records/:id/cancel — pending or approved only, reason required. */
export const cancelCommissionRecord = async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Commission record not found' });
  if (!['pending', 'approved'].includes(record.status)) {
    return res.status(409).json({ success: false, message: `Only a pending or approved record can be cancelled (this one is ${record.status}).` });
  }

  record.status = 'cancelled';
  record.cancelledReason = req.body.reason;
  await record.save();

  logAudit({
    shopId: record.shopId,
    adminId: req.admin._id,
    action: 'admin.commission_record.cancelled',
    entityType: 'CommissionRecord',
    entityId: record._id,
    details: { agentId: String(record.agentId), reason: req.body.reason },
    req,
  }).catch(() => {});

  res.json({ success: true, data: record });
};
