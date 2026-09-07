import { getSmartDukaModels } from '../../../models/smartduka/index.js';
import { dispatchPushCampaign, InternalApiError } from '../../../services/internalApiClient.js';
import { logAudit } from '../../../services/auditLogService.js';

const AUDIENCES = ['shopOwner', 'employee', 'agent'];

const toPlainAudience = (audience) => (audience?.toObject ? audience.toObject() : { ...(audience ?? {}) });

/** GET /admin/settings/referral */
export const getReferralConfig = async (req, res) => {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  res.json({
    success: true,
    data: {
      shopOwner: {
        enabled: platform.referral?.shopOwner?.enabled ?? false,
        startsAt: platform.referral?.shopOwner?.startsAt ?? null,
        endsAt: platform.referral?.shopOwner?.endsAt ?? null,
        percentPerReferral: platform.referral?.shopOwner?.percentPerReferral ?? 0,
        maxStackedPercent: platform.referral?.shopOwner?.maxStackedPercent ?? 100,
      },
      employee: {
        enabled: platform.referral?.employee?.enabled ?? false,
        startsAt: platform.referral?.employee?.startsAt ?? null,
        endsAt: platform.referral?.employee?.endsAt ?? null,
        cashAmount: platform.referral?.employee?.cashAmount ?? 0,
      },
      agent: {
        enabled: platform.referral?.agent?.enabled ?? false,
        startsAt: platform.referral?.agent?.startsAt ?? null,
        endsAt: platform.referral?.agent?.endsAt ?? null,
        trialDays: platform.referral?.agent?.trialDays ?? 30,
      },
    },
  });
};

/**
 * PATCH /admin/settings/referral — updates one or more of the three
 * independent referral programs (shop owners, employees, agents). Not a
 * payment credential, so no step-up verification (unlike PATCH
 * /platform-config). Each audience sub-object only changes the keys it
 * actually received, same partial-merge discipline as every other
 * update-schema in this app.
 *
 * Optionally fires a push notification as a side effect, targeted at
 * whichever role the notify is actually about (owners for the shop-owner
 * program, staff for the employee program — agents aren't User documents,
 * so the push path never applies there, enforced by the validation schema
 * requiring notifyAudience whenever notify is true). Reuses the existing
 * PushCampaign create+dispatch flow verbatim and dispatches immediately.
 */
export const updateReferralConfig = async (req, res) => {
  const { PlatformConfig, PushCampaign } = await getSmartDukaModels();
  const { shopOwner, employee, agent, notify, notifyTitle, notifyBody, notifyAudience } = req.body;

  const platform = await PlatformConfig.get();
  const next = { referral: {} };
  for (const key of AUDIENCES) {
    next.referral[key] = toPlainAudience(platform.referral?.[key]);
  }

  if (shopOwner) Object.assign(next.referral.shopOwner, shopOwner);
  if (employee) Object.assign(next.referral.employee, employee);
  if (agent) Object.assign(next.referral.agent, agent);

  platform.referral = next.referral;
  await platform.save();

  let campaign = null;
  let notifyError = null;
  if (notify) {
    campaign = await PushCampaign.create({
      title: notifyTitle,
      body: notifyBody,
      segment: { type: 'all', roles: [notifyAudience] },
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
    details: { referral: next.referral, notified: Boolean(notify) && !notifyError, notifyError: notifyError || undefined },
    req,
  }).catch(() => {});

  res.json({
    success: true,
    data: { ...next.referral, notifyError },
  });
};
