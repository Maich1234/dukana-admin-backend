import { getSmartDukaModels } from '../../../models/smartduka/index.js';
import { dispatchPushCampaign, InternalApiError } from '../../../services/internalApiClient.js';
import { logAudit } from '../../../services/auditLogService.js';

/** GET /admin/settings/referral */
export const getReferralConfig = async (req, res) => {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  res.json({
    success: true,
    data: {
      enabled: platform.referral?.enabled ?? false,
      percentPerReferral: platform.referral?.percentPerReferral ?? 0,
      maxStackedPercent: platform.referral?.maxStackedPercent ?? 100,
    },
  });
};

/**
 * PATCH /admin/settings/referral — updates the owner-to-owner referral
 * program's rate/cap. Not a payment credential, so no step-up verification
 * (unlike PATCH /platform-config). Optionally fires a push notification to
 * every shop owner as a side effect — reuses the existing PushCampaign
 * create+dispatch flow verbatim rather than a second notification path, and
 * dispatches immediately (never scheduled — "notify now" is the whole point).
 */
export const updateReferralConfig = async (req, res) => {
  const { PlatformConfig, PushCampaign } = await getSmartDukaModels();
  const { enabled, percentPerReferral, maxStackedPercent, notify, notifyTitle, notifyBody } = req.body;

  const platform = await PlatformConfig.get();
  const referral = platform.referral?.toObject ? platform.referral.toObject() : { ...(platform.referral ?? {}) };
  if (enabled !== undefined) referral.enabled = enabled;
  if (percentPerReferral !== undefined) referral.percentPerReferral = percentPerReferral;
  if (maxStackedPercent !== undefined) referral.maxStackedPercent = maxStackedPercent;
  platform.referral = referral;
  await platform.save();

  let campaign = null;
  let notifyError = null;
  if (notify) {
    campaign = await PushCampaign.create({
      title: notifyTitle,
      body: notifyBody,
      segment: { type: 'all', roles: ['owner'] },
      createdBy: req.admin._id,
    });
    try {
      await dispatchPushCampaign(campaign._id);
    } catch (err) {
      // The config change itself already saved successfully — a failed
      // notification shouldn't look like the whole request failed. The
      // campaign stays in the PushCampaign list (status 'scheduled') and can
      // be retried from Settings → Push.
      notifyError = err instanceof InternalApiError ? err.message : 'Could not send the notification right now.';
    }
  }

  logAudit({
    adminId: req.admin._id,
    action: 'admin.referral_config.updated',
    entityType: 'PlatformConfig',
    entityId: platform._id,
    details: { referral, notified: Boolean(notify) && !notifyError, notifyError: notifyError || undefined },
    req,
  }).catch(() => {});

  res.json({
    success: true,
    data: {
      enabled: referral.enabled,
      percentPerReferral: referral.percentPerReferral,
      maxStackedPercent: referral.maxStackedPercent,
      notifyError,
    },
  });
};
