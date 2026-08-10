import { getSmartDukaModels } from '../../../models/smartduka/index.js';
import { logAudit } from '../../../services/auditLogService.js';

/** GET /admin/settings/plans — every plan, including inactive ones, by display order. */
export const listPlans = async (req, res) => {
  const { SubscriptionPlan } = await getSmartDukaModels();
  const plans = await SubscriptionPlan.find().sort({ displayOrder: 1 });
  res.json({ success: true, data: plans });
};

/** POST /admin/settings/plans */
export const createPlan = async (req, res) => {
  const { SubscriptionPlan } = await getSmartDukaModels();
  const plan = await SubscriptionPlan.create(req.body);

  logAudit({
    adminId: req.admin._id,
    action: 'admin.plan.created',
    entityType: 'SubscriptionPlan',
    entityId: plan._id,
    details: { slug: plan.slug },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: plan });
};

/** PATCH /admin/settings/plans/:id — active: false is the soft-delete; there is no hard delete. */
export const updatePlan = async (req, res) => {
  const { SubscriptionPlan } = await getSmartDukaModels();
  const plan = await SubscriptionPlan.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

  logAudit({
    adminId: req.admin._id,
    action: 'admin.plan.updated',
    entityType: 'SubscriptionPlan',
    entityId: plan._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: plan });
};
