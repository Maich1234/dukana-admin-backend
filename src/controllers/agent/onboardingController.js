import Onboarding from '../../models/admin/Onboarding.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';
import { attachDisplayStage, attachShopSummary } from '../../services/onboardingService.js';

/** GET /agent/onboarding — implicitly scoped to the calling agent; never a client-supplied filter. */
export const listOnboarding = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { agentId: req.agent._id };
  if (req.query.stage) filter.stage = req.query.stage;

  const [rows, total] = await Promise.all([
    Onboarding.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Onboarding.countDocuments(filter),
  ]);

  const withShop = await attachShopSummary(rows);
  const data = await attachDisplayStage(withShop);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** GET /agent/onboarding/:id — req.onboarding is pre-loaded and scope-checked by requireAssignedOnboarding. */
export const getOnboarding = async (req, res) => {
  const [withShop] = await attachShopSummary([req.onboarding]);
  const [data] = await attachDisplayStage([withShop]);
  res.json({ success: true, data });
};

/**
 * PATCH /agent/onboarding/:id — an agent may only ever edit lead info, never
 * `stage` (admin-managed) or `shopId` (admin-linked). Joi's
 * agentUpdateOnboardingSchema already strips those keys if sent; this is a
 * second, defense-in-depth line since the shape of req.body is trusted here.
 */
export const updateOnboarding = async (req, res) => {
  const onboarding = req.onboarding;
  const { leadName, leadPhone, leadEmail, leadNotes } = req.body;

  if (leadName !== undefined) onboarding.leadName = leadName;
  if (leadPhone !== undefined) onboarding.leadPhone = leadPhone;
  if (leadEmail !== undefined) onboarding.leadEmail = leadEmail;
  if (leadNotes !== undefined) onboarding.leadNotes = leadNotes;

  await onboarding.save();

  logAudit({
    shopId: onboarding.shopId ?? undefined,
    action: 'agent.onboarding.updated',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    details: { agentId: String(req.agent._id), agentEmail: req.agent.email, fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: onboarding });
};

/** Scope is rechecked in the write, so reassignment cannot race collection. */
export async function recordTraining(req, res) {
  const { expectedTrainingRevision, ...training } = req.body;
  const updated = await Onboarding.findOneAndUpdate({ _id: req.params.id, agentId: req.agent._id, ...(expectedTrainingRevision === 0 ? { $or: [{ trainingRevision: 0 }, { trainingRevision: { $exists: false } }] } : { trainingRevision: expectedTrainingRevision }) }, { $inc: { trainingRevision: 1 }, $set: { training: { ...training, recordedBy: req.agent._id, recordedAt: new Date() } } }, { new: true, runValidators: true });
  if (!updated) return res.status(409).json({ success: false, message: 'This record changed or was reassigned. Refresh before saving.' });
  logAudit({ shopId: updated.shopId ?? undefined, action: 'agent.onboarding.training_recorded', entityType: 'Onboarding', entityId: updated._id, details: { agentId: String(req.agent._id), revision: updated.trainingRevision }, req }).catch(() => {});
  res.json({ success: true, data: updated });
}
export async function recordOnboardingPayment(req, res) {
  const payment = { ...req.body, reference: String(req.body.reference ?? '').trim().toUpperCase(), amount: 1000, currency: 'KES', collectedBy: req.agent._id, agentName: req.agent.name ?? '', recordedAt: new Date() };
  const updated = await Onboarding.findOneAndUpdate({ _id: req.params.id, agentId: req.agent._id, onboardingPayment: null }, { $set: { onboardingPayment: payment } }, { new: true, runValidators: true });
  if (!updated) {
    const existing = await Onboarding.findOne({ _id: req.params.id, agentId: req.agent._id }).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Onboarding record not found.' });
    const old = existing.onboardingPayment;
    if (old && String(old.collectedBy) === String(req.agent._id) && old.method === payment.method && String(old.reference ?? '').trim().toUpperCase() === payment.reference && new Date(old.paidAt).getTime() === new Date(payment.paidAt).getTime() && old.notes === payment.notes) return res.json({ success: true, data: existing, replayed: true });
    return res.status(409).json({ success: false, message: 'An onboarding payment is already recorded. It cannot be collected or overwritten again.' });
  }
  logAudit({ shopId: updated.shopId ?? undefined, action: 'agent.onboarding.fee_recorded', entityType: 'Onboarding', entityId: updated._id, details: { amount: 1000, currency: 'KES', agentId: String(req.agent._id), method: payment.method, reference: payment.reference }, req }).catch(() => {});
  res.status(201).json({ success: true, data: updated });
}
