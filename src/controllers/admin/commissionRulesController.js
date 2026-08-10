import CommissionRule from '../../models/admin/CommissionRule.js';
import { logAudit } from '../../services/auditLogService.js';

/** GET /admin/commission-rules */
export const listCommissionRules = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const rules = await CommissionRule.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: rules });
};

/** POST /admin/commission-rules */
export const createCommissionRule = async (req, res) => {
  const rule = await CommissionRule.create({ ...req.body, createdBy: req.admin._id });

  logAudit({
    adminId: req.admin._id,
    action: 'admin.commission_rule.created',
    entityType: 'CommissionRule',
    entityId: rule._id,
    details: { name: rule.name, type: rule.type, value: rule.value },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: rule });
};

/**
 * PATCH /admin/commission-rules/:id — field edits plus the status toggle. No
 * DELETE endpoint anywhere: CommissionRecords reference a rule by id for
 * traceability, so deactivating (not deleting) is the only way to retire one.
 */
export const updateCommissionRule = async (req, res) => {
  const rule = await CommissionRule.findById(req.params.id);
  if (!rule) return res.status(404).json({ success: false, message: 'Commission rule not found' });

  const resultingType = req.body.type ?? rule.type;
  const resultingValue = req.body.value ?? rule.value;
  if (resultingType === 'percentage' && resultingValue > 100) {
    return res.status(400).json({ success: false, message: 'A percentage commission value cannot exceed 100.' });
  }

  Object.assign(rule, req.body);
  await rule.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.commission_rule.updated',
    entityType: 'CommissionRule',
    entityId: rule._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: rule });
};
