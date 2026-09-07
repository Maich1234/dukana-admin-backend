import CommissionRecord from '../../models/admin/CommissionRecord.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';

/**
 * GET /agent/commissions — read-only, scoped to the calling agent. Always
 * `agentId: req.agent._id` regardless of any `agentId` the client sends —
 * an agent can never view another agent's commissions, even by guessing an
 * id in the query string.
 */
export const listOwnCommissions = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { agentId: req.agent._id };
  if (req.query.status) filter.status = req.query.status;

  const [records, total] = await Promise.all([
    CommissionRecord.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    CommissionRecord.countDocuments(filter),
  ]);
  res.json({ success: true, data: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/**
 * POST /agent/commissions/:id/redeem — flags an approved record as
 * "payout requested" for admin triage. Doesn't touch `status` or any of the
 * approve/pay flow above — payment still only ever happens through those
 * existing admin-only transitions.
 */
export const requestCommissionPayout = async (req, res) => {
  const record = await CommissionRecord.findOne({ _id: req.params.id, agentId: req.agent._id });
  if (!record) return res.status(404).json({ success: false, message: 'Commission record not found' });
  if (record.status !== 'approved') {
    return res.status(409).json({ success: false, message: `Only an approved record can be redeemed (this one is ${record.status}).` });
  }

  record.payoutRequestedAt = new Date();
  await record.save();

  logAudit({
    shopId: record.shopId,
    action: 'agent.commission_record.payout_requested',
    entityType: 'CommissionRecord',
    entityId: record._id,
    details: { agentId: String(record.agentId) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: record });
};
