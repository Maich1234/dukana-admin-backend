import { getSmartDukaModels } from '../../../models/smartduka/index.js';
import { dispatchPushCampaign, InternalApiError } from '../../../services/internalApiClient.js';
import { parsePagination } from '../../../utils/pagination.js';
import { logAudit } from '../../../services/auditLogService.js';

/** GET /admin/settings/push-campaigns */
export const listPushCampaigns = async (req, res) => {
  const { PushCampaign } = await getSmartDukaModels();
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const [campaigns, total] = await Promise.all([
    PushCampaign.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PushCampaign.countDocuments(),
  ]);
  res.json({ success: true, data: campaigns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/**
 * POST /admin/settings/push-campaigns — always saves as 'scheduled'
 * (scheduledAt may be null, meaning "not yet dispatched"). Creating never
 * sends by itself — the client follows up with POST /:id/send for an
 * immediate send, or leaves it for smart-duka-backend's own dispatcher cron
 * once scheduledAt arrives.
 */
export const createPushCampaign = async (req, res) => {
  const { PushCampaign } = await getSmartDukaModels();
  const campaign = await PushCampaign.create({ ...req.body, createdBy: req.admin._id });

  logAudit({
    adminId: req.admin._id,
    action: 'admin.push_campaign.created',
    entityType: 'PushCampaign',
    entityId: campaign._id,
    details: { title: campaign.title, segmentType: campaign.segment?.type },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: campaign });
};

/**
 * POST /admin/settings/push-campaigns/:id/send — "Send now". Delegates to
 * smart-duka-backend's internal dispatch endpoint, since only that service
 * holds the Firebase Admin credentials/SDK this requires — this backend
 * never calls Firebase directly.
 */
export const sendPushCampaign = async (req, res) => {
  let campaign;
  try {
    campaign = await dispatchPushCampaign(req.params.id);
  } catch (err) {
    if (err instanceof InternalApiError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    throw err;
  }

  logAudit({
    adminId: req.admin._id,
    action: 'admin.push_campaign.sent',
    entityType: 'PushCampaign',
    entityId: req.params.id,
    details: { stats: campaign.stats },
    req,
  }).catch(() => {});

  res.json({ success: true, data: campaign });
};

/** PATCH /admin/settings/push-campaigns/:id/cancel — only while still scheduled and unclaimed. */
export const cancelPushCampaign = async (req, res) => {
  const { PushCampaign } = await getSmartDukaModels();
  const campaign = await PushCampaign.findOneAndUpdate(
    { _id: req.params.id, status: 'scheduled' },
    { $set: { status: 'cancelled' } },
    { new: true }
  );
  if (!campaign) {
    return res.status(409).json({ success: false, message: 'Campaign can only be cancelled while scheduled.' });
  }

  logAudit({
    adminId: req.admin._id,
    action: 'admin.push_campaign.cancelled',
    entityType: 'PushCampaign',
    entityId: campaign._id,
    req,
  }).catch(() => {});

  res.json({ success: true, data: campaign });
};
