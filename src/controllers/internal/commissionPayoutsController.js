import CommissionRecord from '../../models/admin/CommissionRecord.js';
import { logAudit } from '../../services/auditLogService.js';

/**
 * POST /internal/commission-payouts/result — service-to-service only
 * (smart-duka-backend, pushed the moment Safaricom's B2C ResultURL/
 * QueueTimeOutURL fires). Reconciles the CommissionRecord that initiated the
 * matching B2CTransaction. Idempotent: a record no longer 'paying' has
 * already been reconciled (by this same call racing itself, or by the
 * backstop cron) and is left untouched.
 */
export const receiveCommissionPayoutResult = async (req, res) => {
  const { reference, status, mpesaReceiptNumber, resultDesc } = req.body;
  if (!reference || !status) {
    return res.status(400).json({ success: false, message: 'reference and status are required' });
  }

  const record = await CommissionRecord.findById(reference);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Commission record not found' });
  }
  if (record.status !== 'paying') {
    return res.json({ success: true, data: { alreadyReconciled: true } });
  }

  if (status === 'completed') {
    record.status = 'paid';
    record.paidAt = new Date();
  } else {
    record.status = 'approved';
    record.payoutFailureReason = resultDesc || 'The M-Pesa payout failed.';
  }
  await record.save();

  logAudit({
    shopId: record.shopId,
    action: status === 'completed' ? 'admin.commission_record.b2c_paid' : 'admin.commission_record.b2c_failed',
    entityType: 'CommissionRecord',
    entityId: record._id,
    details: { agentId: String(record.agentId), mpesaReceiptNumber, resultDesc },
    req,
  }).catch(() => {});

  res.json({ success: true, data: { status: record.status } });
};
