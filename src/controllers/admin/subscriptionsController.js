import { getSmartDukaModels } from '../../models/smartduka/index.js';
import { deriveAccess } from '../../services/subscriptionPricingService.js';
import { reconcileSubscriptionPayment, InternalApiError } from '../../services/internalApiClient.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';

/** GET /admin/subscriptions */
export const listSubscriptions = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { Subscription, PlatformConfig } = await getSmartDukaModels();

  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [subscriptions, total, platform] = await Promise.all([
    Subscription.find(filter).populate('shop', 'name email').populate('plan', 'name slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Subscription.countDocuments(filter),
    PlatformConfig.get(),
  ]);

  const data = subscriptions.map((s) => ({ ...s, access: deriveAccess(s, platform.gracePeriodDays) }));
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/**
 * GET /admin/subscriptions/:id — amountDue is read directly from the most
 * recent pending payment's own `amount` field (computed once, server-side,
 * by smart-duka-backend's pricing engine at the moment that payment was
 * created) — never recomputed independently here, which would risk this
 * backend's pricing math silently drifting from the one that actually
 * charges anyone.
 */
export const getSubscription = async (req, res) => {
  const { Subscription, SubscriptionPayment, PlatformConfig } = await getSmartDukaModels();

  const subscription = await Subscription.findById(req.params.id).populate('shop', 'name email').populate('plan');
  if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });

  const [payments, platform] = await Promise.all([
    SubscriptionPayment.find({ subscription: subscription._id }).sort({ createdAt: -1 }).limit(20).lean(),
    PlatformConfig.get(),
  ]);

  const pendingPayment = payments.find((p) => p.status === 'pending') ?? null;

  res.json({
    success: true,
    data: {
      subscription,
      access: deriveAccess(subscription, platform.gracePeriodDays),
      amountDue: pendingPayment?.amount ?? null,
      payments,
    },
  });
};

/**
 * PATCH /admin/subscriptions/:id/grace-extension — grants one shop extra
 * days before it locks, on top of the platform-wide grace period. Set days
 * to 0 to revoke an extension. Ports smart-duka-backend's
 * grantGraceExtension.
 */
export const grantGraceExtension = async (req, res) => {
  const { Subscription, PlatformConfig } = await getSmartDukaModels();
  const { days, reason } = req.body;

  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });

  const previousDays = subscription.graceExtensionDays ?? 0;
  subscription.graceExtensionDays = days;
  subscription.graceExtensionGrantedAt = days > 0 ? new Date() : null;
  subscription.graceExtensionGrantedBy = days > 0 ? req.admin._id : null;
  subscription.graceExtensionReason = days > 0 ? (reason ?? '') : '';
  await subscription.save();

  const platform = await PlatformConfig.get();

  logAudit({
    shopId: subscription.shop,
    adminId: req.admin._id,
    action: days > 0 ? 'admin.subscription.grace_extended' : 'admin.subscription.grace_revoked',
    entityType: 'Subscription',
    entityId: subscription._id,
    details: { previousDays, days, reason: reason ?? '' },
    req,
  }).catch(() => {});

  res.json({
    success: true,
    data: {
      graceExtensionDays: subscription.graceExtensionDays,
      access: deriveAccess(subscription.toObject(), platform.gracePeriodDays),
    },
    message: days > 0
      ? `This shop now has ${days} extra day${days === 1 ? '' : 's'} before it locks.`
      : 'Grace extension removed.',
  });
};

/**
 * POST /admin/subscriptions/:id/payments/:paymentId/reconcile — re-verifies
 * a payment directly against Safaricom via smart-duka-backend's internal
 * endpoint (this backend has no Daraja credentials/SDK of its own — see the
 * plan's "two actions need a live third-party call" note) and activates the
 * subscription if it actually went through.
 */
export const reconcileShopPayment = async (req, res) => {
  let result;
  try {
    result = await reconcileSubscriptionPayment(req.params.paymentId);
  } catch (err) {
    if (err instanceof InternalApiError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    throw err;
  }

  logAudit({
    shopId: result.shopId,
    adminId: req.admin._id,
    action: 'admin.subscription_payment.reconciled',
    entityType: 'SubscriptionPayment',
    entityId: result.paymentId,
    details: {
      statusBefore: result.statusBefore,
      statusAfter: result.status,
      activated: result.activated,
    },
    req,
  }).catch(() => {});

  res.json({ success: true, data: result });
};
