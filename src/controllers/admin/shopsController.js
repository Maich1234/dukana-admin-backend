import { getSmartDukaModels } from '../../models/smartduka/index.js';
import Onboarding from '../../models/admin/Onboarding.js';
import AuditLog from '../../models/admin/AuditLog.js';
import { deriveAccess } from '../../services/subscriptionPricingService.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';

// Fields an admin may edit directly. isActive/owner/paymentMethods are
// deliberately excluded — isActive only ever changes via the dedicated
// suspend/reactivate routes below (a distinct permission,
// `shops.suspend`, from plain `shops.edit`), and owner/paymentMethods stay
// entirely owner-controlled in smart-duka-web.
const EDITABLE_SHOP_FIELDS = ['name', 'phone', 'email', 'address', 'county', 'subCounty', 'taxRate', 'currency'];

// V1 shortcut, documented rather than hidden: `subscriptionState` and
// `agentId` are filters over *derived* data (a computed access state, and an
// Onboarding join) that Mongo can't filter on directly without a second
// collection lookup. Rather than a second round-trip per page, this pulls a
// capped, id-only candidate set (sorted, matching the plain-field filters)
// and does the derived filtering + final pagination in memory. Fine at
// platform-admin scale (shops, not sales rows); would need revisiting if
// the shop count ever approached the cap.
const CANDIDATE_CAP = 5000;

/** GET /admin/shops */
export const listShops = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { Shop, User, Subscription, PlatformConfig } = await getSmartDukaModels();

  const platform = await PlatformConfig.get();

  const filter = {};
  if (req.query.q) {
    const q = String(req.query.q).trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'suspended') filter.isActive = false;

  if (req.query.agentId) {
    const onboardings = await Onboarding.find({ agentId: req.query.agentId, shopId: { $ne: null } }).select('shopId').lean();
    filter._id = { $in: onboardings.map((o) => o.shopId) };
  }

  if (req.query.subscriptionState) {
    // Scoped by whatever q/status/agentId filter already narrowed `filter`
    // to, then further narrowed to shops whose derived access state matches
    // — replacing filter._id entirely is safe here since these candidates
    // are already a subset of any prior _id constraint.
    const candidates = await Shop.find(filter).select('_id').sort({ createdAt: -1 }).limit(CANDIDATE_CAP).lean();
    const subscriptions = await Subscription.find({ shop: { $in: candidates.map((c) => c._id) } }).lean();
    const subByShop = new Map(subscriptions.map((s) => [String(s.shop), s]));
    const candidateIds = candidates
      .filter((c) => deriveAccess(subByShop.get(String(c._id)) ?? null, platform.gracePeriodDays).state === req.query.subscriptionState)
      .map((c) => c._id);
    filter._id = { $in: candidateIds };
  }

  const [shops, total] = await Promise.all([
    Shop.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Shop.countDocuments(filter),
  ]);

  const shopIds = shops.map((s) => s._id);
  const [subscriptions, staffCounts, onboardings] = await Promise.all([
    Subscription.find({ shop: { $in: shopIds } }).populate('plan').lean(),
    User.aggregate([
      { $match: { shop: { $in: shopIds }, isActive: true } },
      { $group: { _id: '$shop', count: { $sum: 1 } } },
    ]),
    Onboarding.find({ shopId: { $in: shopIds } }).select('shopId agentId').lean(),
  ]);
  const subByShop = new Map(subscriptions.map((s) => [String(s.shop), s]));
  const staffCountByShop = new Map(staffCounts.map((s) => [String(s._id), s.count]));
  const onboardingByShop = new Map(onboardings.map((o) => [String(o.shopId), o]));

  const data = shops.map((shop) => {
    const subscription = subByShop.get(String(shop._id)) ?? null;
    return {
      _id: shop._id,
      name: shop.name,
      email: shop.email,
      phone: shop.phone,
      isActive: shop.isActive,
      createdAt: shop.createdAt,
      staffCount: staffCountByShop.get(String(shop._id)) ?? 0,
      plan: subscription?.plan ? { name: subscription.plan.name, slug: subscription.plan.slug } : null,
      access: deriveAccess(subscription, platform.gracePeriodDays),
      agentId: onboardingByShop.get(String(shop._id))?.agentId ?? null,
    };
  });

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** GET /admin/shops/:id — overview + subscription composite. */
export const getShop = async (req, res) => {
  const { Shop, Subscription, PlatformConfig } = await getSmartDukaModels();
  const shop = await Shop.findById(req.params.id).lean();
  if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

  const [subscription, platform, onboarding] = await Promise.all([
    Subscription.findOne({ shop: shop._id }).populate('plan').lean(),
    PlatformConfig.get(),
    Onboarding.findOne({ shopId: shop._id }).populate('agentId', 'name email').lean(),
  ]);

  res.json({
    success: true,
    data: {
      shop,
      subscription,
      access: deriveAccess(subscription, platform.gracePeriodDays),
      onboarding: onboarding ? { _id: onboarding._id, agent: onboarding.agentId, stage: onboarding.stage } : null,
    },
  });
};

/** GET /admin/shops/:id/users */
export const getShopUsers = async (req, res) => {
  const { User } = await getSmartDukaModels();
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { shop: req.params.id };
  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ role: -1, createdAt: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** GET /admin/shops/:id/payments */
export const getShopPayments = async (req, res) => {
  const { SubscriptionPayment } = await getSmartDukaModels();
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { shop: req.params.id };
  const [payments, total] = await Promise.all([
    SubscriptionPayment.find(filter).populate('plan', 'name slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SubscriptionPayment.countDocuments(filter),
  ]);
  res.json({ success: true, data: payments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/**
 * GET /admin/shops/:id/activity — recent platform-admin actions taken
 * against this shop (grace extensions, edits, suspensions, ...), from this
 * app's own AuditLog. This is not the shop's own operational history (sales,
 * purchases, staff changes) — that trail lives in smart-duka-backend's
 * separate AuditLog, which this backend has no connection to by design (see
 * the plan's "AuditLog is NOT admin-only" correction).
 */
export const getShopActivity = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 100 });
  const filter = { shopId: req.params.id };
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** PATCH /admin/shops/:id */
export const updateShop = async (req, res) => {
  const { Shop } = await getSmartDukaModels();
  const shop = await Shop.findById(req.params.id);
  if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

  const before = {};
  const changed = [];
  for (const field of EDITABLE_SHOP_FIELDS) {
    if (req.body[field] === undefined) continue;
    before[field] = shop[field];
    shop[field] = req.body[field];
    changed.push(field);
  }
  await shop.save();

  logAudit({
    shopId: shop._id,
    adminId: req.admin._id,
    action: 'admin.shop.updated',
    entityType: 'Shop',
    entityId: shop._id,
    details: { fieldsChanged: changed, before },
    req,
  }).catch(() => {});

  res.json({ success: true, data: shop });
};

/** PATCH /admin/shops/:id/suspend */
export const suspendShop = async (req, res) => {
  const { Shop } = await getSmartDukaModels();
  const shop = await Shop.findById(req.params.id);
  if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

  shop.isActive = false;
  await shop.save();

  logAudit({
    shopId: shop._id,
    adminId: req.admin._id,
    action: 'admin.shop.suspended',
    entityType: 'Shop',
    entityId: shop._id,
    details: { reason: req.body?.reason ?? '' },
    req,
  }).catch(() => {});

  res.json({ success: true, data: { _id: shop._id, isActive: shop.isActive } });
};

/** PATCH /admin/shops/:id/reactivate */
export const reactivateShop = async (req, res) => {
  const { Shop } = await getSmartDukaModels();
  const shop = await Shop.findById(req.params.id);
  if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

  shop.isActive = true;
  await shop.save();

  logAudit({
    shopId: shop._id,
    adminId: req.admin._id,
    action: 'admin.shop.reactivated',
    entityType: 'Shop',
    entityId: shop._id,
    req,
  }).catch(() => {});

  res.json({ success: true, data: { _id: shop._id, isActive: shop.isActive } });
};

/**
 * GET /admin/shops/lookup?email= — resolves a shop from an owner/staff login
 * email. Shop.email is a separate business-contact field; the account's real
 * login email lives on User, which is what support actually has when a
 * customer reports a problem with "their account". Also the mechanism used
 * to link a shopId onto an Onboarding row (see onboardingController.js) —
 * there is no signup webhook in V1.
 */
export const lookupShopByUser = async (req, res) => {
  const email = (req.query.email ?? '').toString().toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email query param is required' });
  }

  const { User } = await getSmartDukaModels();
  const user = await User.findOne({ email }).select('name email role shop isActive').populate('shop', 'name email').lean();
  if (!user) {
    return res.status(404).json({ success: false, message: 'No user found with that email' });
  }

  res.json({
    success: true,
    data: {
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive },
      shop: user.shop,
    },
  });
};
