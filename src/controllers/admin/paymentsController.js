import { getSmartDukaModels } from '../../models/smartduka/index.js';
import { parsePagination } from '../../utils/pagination.js';

/**
 * GET /admin/payments — over SubscriptionPayment only (subscription billing),
 * never MpesaTransaction, which is shop-till sales — a different concept
 * entirely, per the plan.
 */
export const listPayments = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { SubscriptionPayment } = await getSmartDukaModels();

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.shopId) filter.shop = req.query.shopId;
  if (req.query.method) filter.provider = req.query.method;
  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
  }

  const [payments, total] = await Promise.all([
    SubscriptionPayment.find(filter)
      .populate('shop', 'name email')
      .populate('plan', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SubscriptionPayment.countDocuments(filter),
  ]);

  res.json({ success: true, data: payments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
