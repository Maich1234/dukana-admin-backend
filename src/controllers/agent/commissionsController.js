import CommissionRecord from '../../models/admin/CommissionRecord.js';
import { parsePagination } from '../../utils/pagination.js';

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
