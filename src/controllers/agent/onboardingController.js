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
