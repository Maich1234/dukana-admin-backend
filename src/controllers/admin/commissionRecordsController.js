import CommissionRecord from '../../models/admin/CommissionRecord.js';
import Agent from '../../models/admin/Agent.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';
import { initiateB2CPayout as callB2CPayout, InternalApiError } from '../../services/internalApiClient.js';

/** GET /admin/commission-records */
export const listCommissionRecords = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.agentId) filter.agentId = req.query.agentId;
  if (req.query.shopId) filter.shopId = req.query.shopId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.payoutRequested === 'true') filter.payoutRequestedAt = { $ne: null };
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

/**
 * PATCH /admin/commission-records/:id/pay — approved → paid. Same gate
 * ("release money") as approve. Atomic claim, same reasoning as
 * initiateB2CPayout below — this must not be able to race a concurrent
 * "Pay via M-Pesa" click into both "succeeding" on the same commission.
 */
export const payCommissionRecord = async (req, res) => {
  const record = await CommissionRecord.findOneAndUpdate(
    { _id: req.params.id, status: 'approved' },
    { $set: { status: 'paid', payoutMethod: 'manual', paidBy: req.admin._id, paidAt: new Date() } },
    { new: true }
  );
  if (!record) {
    const existing = await CommissionRecord.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Commission record not found' });
    return res.status(409).json({ success: false, message: `Only an approved record can be marked paid (this one is ${existing.status}).` });
  }

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

/**
 * PATCH /admin/commission-records/:id/pay-via-mpesa — approved → paying.
 * Same permission as the manual pay above ("release money"). The eventual
 * outcome (paid, or reverted to approved with payoutFailureReason) arrives
 * via internal/commissionPayoutsController.js, pushed from smart-duka-backend.
 *
 * Claims the record atomically (approved → paying) BEFORE calling out to
 * Safaricom — a plain read-then-write here would let two concurrent clicks
 * (or a retry after a lost response) both pass the status check and trigger
 * two real payouts for the same commission. If the outbound call then fails,
 * the claim is atomically released back to 'approved' so a retry is safe.
 */
export const initiateB2CPayout = async (req, res) => {
  const claimed = await CommissionRecord.findOneAndUpdate(
    { _id: req.params.id, status: 'approved' },
    { $set: { status: 'paying', payoutMethod: 'mpesa_b2c', payoutFailureReason: '' } },
    { new: true }
  );
  if (!claimed) {
    const existing = await CommissionRecord.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Commission record not found' });
    return res.status(409).json({ success: false, message: `Only an approved record can be paid out (this one is ${existing.status}).` });
  }

  const agent = await Agent.findById(claimed.agentId);
  if (!agent?.phone) {
    await CommissionRecord.updateOne({ _id: claimed._id, status: 'paying' }, { $set: { status: 'approved', payoutMethod: null } });
    return res.status(400).json({ success: false, message: 'This agent has no phone number on file for M-Pesa payout.' });
  }

  let payout;
  try {
    payout = await callB2CPayout({
      reference: String(claimed._id),
      phoneNumber: agent.phone,
      amount: claimed.commissionAmount,
      remarks: 'Dukana agent commission',
      occasion: 'Commission',
    });
  } catch (err) {
    await CommissionRecord.updateOne(
      { _id: claimed._id, status: 'paying' },
      { $set: { status: 'approved', payoutMethod: null, payoutFailureReason: err.message } }
    );
    const status = err instanceof InternalApiError ? err.status : 502;
    return res.status(status).json({ success: false, message: err.message });
  }

  const record = await CommissionRecord.findOneAndUpdate(
    { _id: claimed._id, status: 'paying' },
    { $set: { b2cConversationId: payout.conversationId, b2cOriginatorConversationId: payout.originatorConversationId } },
    { new: true }
  ) ?? claimed;

  logAudit({
    shopId: record.shopId,
    adminId: req.admin._id,
    action: 'admin.commission_record.payout_initiated',
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
