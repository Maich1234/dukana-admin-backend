import AuditLog from '../../models/admin/AuditLog.js';
import { parsePagination } from '../../utils/pagination.js';

/**
 * GET /admin/audit — paginated, newest first, over this backend's own
 * AuditLog (actions taken through dukana-admin-backend only — never
 * smart-duka-backend's separate operational audit trail). GET-only: no write
 * route ever exists here; mutating controllers call logAudit() as a side
 * effect instead.
 */
export const listAuditLogs = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 100 });
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.adminId) filter.adminId = req.query.adminId;
  if (req.query.shopId) filter.shopId = req.query.shopId;
  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ success: true, data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
