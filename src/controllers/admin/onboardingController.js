import Onboarding from '../../models/admin/Onboarding.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';
import { attachDisplayStage, attachShopSummary } from '../../services/onboardingService.js';

/** GET /admin/onboarding */
export const listOnboarding = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.agentId) filter.agentId = req.query.agentId;
  if (req.query.stage) filter.stage = req.query.stage;

  const [rows, total] = await Promise.all([
    Onboarding.find(filter).populate('agentId', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Onboarding.countDocuments(filter),
  ]);

  const withShop = await attachShopSummary(rows);
  const data = await attachDisplayStage(withShop);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** POST /admin/onboarding — creates a new Lead. */
export const createOnboarding = async (req, res) => {
  const onboarding = await Onboarding.create({
    ...req.body,
    createdBy: req.admin._id,
  });

  logAudit({
    adminId: req.admin._id,
    action: 'admin.onboarding.created',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    details: { agentId: String(onboarding.agentId), leadName: onboarding.leadName },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: onboarding });
};

/** GET /admin/onboarding/:id */
export const getOnboarding = async (req, res) => {
  const onboarding = await Onboarding.findById(req.params.id).populate('agentId', 'name email');
  if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found' });

  const [withShop] = await attachShopSummary([onboarding]);
  const [data] = await attachDisplayStage([withShop]);
  res.json({ success: true, data });
};

/**
 * PATCH /admin/onboarding/:id — lead-info edits, stage advancement (only
 * among lead/registered/onboarding — trial/active are display-derived, never
 * stored by hand, see onboardingService.js), and linking a shopId once it's
 * been found via GET /shops/lookup?email=.
 */
export const updateOnboarding = async (req, res) => {
  const onboarding = await Onboarding.findById(req.params.id);
  if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found' });

  const { leadName, leadPhone, leadEmail, leadNotes, stage, shopId } = req.body;

  if (shopId !== undefined) {
    if (onboarding.shopId) {
      return res.status(409).json({ success: false, message: 'This onboarding record is already linked to a shop.' });
    }
    onboarding.shopId = shopId;
    onboarding.registeredAt = onboarding.registeredAt ?? new Date();
    if (onboarding.stage === 'lead') onboarding.stage = 'registered';
  }

  if (leadName !== undefined) onboarding.leadName = leadName;
  if (leadPhone !== undefined) onboarding.leadPhone = leadPhone;
  if (leadEmail !== undefined) onboarding.leadEmail = leadEmail;
  if (leadNotes !== undefined) onboarding.leadNotes = leadNotes;
  if (stage !== undefined) {
    if (stage === 'onboarding' && !onboarding.onboardingStartedAt) onboarding.onboardingStartedAt = new Date();
    onboarding.stage = stage;
  }

  await onboarding.save();

  logAudit({
    adminId: req.admin._id,
    shopId: onboarding.shopId ?? undefined,
    action: 'admin.onboarding.updated',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: onboarding });
};

/**
 * POST /admin/onboarding/:id/reassign — changes the assigned agent, appends
 * an entry to reassignmentHistory for traceability.
 */
export const reassignOnboarding = async (req, res) => {
  const onboarding = await Onboarding.findById(req.params.id);
  if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found' });

  const { agentId, reason } = req.body;
  const fromAgentId = onboarding.agentId;

  if (String(fromAgentId) === String(agentId)) {
    return res.status(400).json({ success: false, message: 'This onboarding record is already assigned to that agent.' });
  }

  onboarding.reassignmentHistory.push({
    fromAgentId,
    toAgentId: agentId,
    changedBy: req.admin._id,
    changedAt: new Date(),
    reason: reason ?? '',
  });
  onboarding.agentId = agentId;
  await onboarding.save();

  logAudit({
    adminId: req.admin._id,
    shopId: onboarding.shopId ?? undefined,
    action: 'admin.onboarding.reassigned',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    details: { fromAgentId: String(fromAgentId), toAgentId: String(agentId), reason: reason ?? '' },
    req,
  }).catch(() => {});

  res.json({ success: true, data: onboarding });
};

/** DELETE /admin/onboarding/:id — only while still a bare lead (never once registered/onboarding/linked). */
export const deleteOnboarding = async (req, res) => {
  const onboarding = await Onboarding.findById(req.params.id);
  if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding record not found' });

  if (onboarding.stage !== 'lead') {
    return res.status(409).json({ success: false, message: 'Only a lead that hasn\'t progressed can be deleted.' });
  }

  await onboarding.deleteOne();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.onboarding.deleted',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    req,
  }).catch(() => {});

  res.json({ success: true, message: 'Lead deleted' });
};
