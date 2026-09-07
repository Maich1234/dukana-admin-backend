import { getSmartDukaModels } from '../../models/smartduka/index.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';

// EmployeeReferralPayout lives in the smart-duka DB (see
// employeeReferralPayoutSchema.js) — created there by
// subscriptionController.js on a referred shop's first successful payment.
// This controller only ever transitions its status; the financial fields
// (amount, staffId, referredShopId) are never accepted from a request body.

/** GET /admin/referral-payouts */
export const listReferralPayouts = async (req, res) => {
  const { EmployeeReferralPayout } = await getSmartDukaModels();
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.staffId) filter.staffId = req.query.staffId;

  const [records, total] = await Promise.all([
    EmployeeReferralPayout.find(filter)
      .populate('staffId', 'name email')
      .populate('shopId', 'name')
      .populate('referredShopId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    EmployeeReferralPayout.countDocuments(filter),
  ]);
  res.json({ success: true, data: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** PATCH /admin/referral-payouts/:id/pay — pending → paid. */
export const payReferralPayout = async (req, res) => {
  const { EmployeeReferralPayout } = await getSmartDukaModels();
  const payout = await EmployeeReferralPayout.findById(req.params.id);
  if (!payout) return res.status(404).json({ success: false, message: 'Referral payout not found' });
  if (payout.status !== 'pending') {
    return res.status(409).json({ success: false, message: `Only a pending payout can be marked paid (this one is ${payout.status}).` });
  }

  payout.status = 'paid';
  payout.paidBy = req.admin._id;
  payout.paidAt = new Date();
  await payout.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.referral_payout.paid',
    entityType: 'EmployeeReferralPayout',
    entityId: payout._id,
    details: { staffId: String(payout.staffId), amount: payout.amount },
    req,
  }).catch(() => {});

  res.json({ success: true, data: payout });
};

/** PATCH /admin/referral-payouts/:id/cancel — pending → cancelled, reason required. */
export const cancelReferralPayout = async (req, res) => {
  const { EmployeeReferralPayout } = await getSmartDukaModels();
  const payout = await EmployeeReferralPayout.findById(req.params.id);
  if (!payout) return res.status(404).json({ success: false, message: 'Referral payout not found' });
  if (payout.status !== 'pending') {
    return res.status(409).json({ success: false, message: `Only a pending payout can be cancelled (this one is ${payout.status}).` });
  }

  payout.status = 'cancelled';
  payout.cancelledReason = req.body.reason;
  await payout.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.referral_payout.cancelled',
    entityType: 'EmployeeReferralPayout',
    entityId: payout._id,
    details: { staffId: String(payout.staffId), reason: req.body.reason },
    req,
  }).catch(() => {});

  res.json({ success: true, data: payout });
};
