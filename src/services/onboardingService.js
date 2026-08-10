import { getSmartDukaModels } from '../models/smartduka/index.js';

// Shared query/derivation functions used by both the admin onboarding
// surface (controllers/admin/onboardingController.js) and its agent mirror
// (controllers/agent/onboardingController.js) — kept in one place so the
// "never trust a stale stored trial/active stage" rule can't drift between
// the two.
//
// Onboarding.stage is authoritative only for lead/registered/onboarding.
// Once a real shopId is linked, the *displayed* stage is always derived from
// a live Subscription.status join (Subscription lives in the secondary
// connection — Onboarding.shopId carries no `ref`, so this is always a
// manual second query + Map join, never a populate()).

const SUBSCRIPTION_STATUS_TO_DISPLAY_STAGE = {
  trialing: 'trial',
  active: 'active',
  past_due: 'past_due',
  cancelled: 'cancelled',
};

/**
 * Derives the stage to actually show for one onboarding row, given the
 * (already-fetched) subscription for its shop, if any.
 */
export function resolveDisplayStage(onboarding, subscription) {
  if (!onboarding.shopId) {
    // Still a lead/registered — the stored stage is authoritative.
    return onboarding.stage;
  }
  if (!subscription) {
    // Shop exists but has no subscription record yet (a brand-new signup
    // the trial-provisioning step hasn't reached) — still "onboarding".
    return 'onboarding';
  }
  return SUBSCRIPTION_STATUS_TO_DISPLAY_STAGE[subscription.status] ?? 'onboarding';
}

/**
 * Batch version: fetches every Subscription for the given onboarding rows'
 * linked shops in one query and returns each row (plain object) with a
 * `displayStage` field attached. Rows with no shopId pass through with
 * displayStage === stage.
 */
export async function attachDisplayStage(onboardingRows) {
  const shopIds = onboardingRows
    .map((o) => o.shopId)
    .filter(Boolean)
    .map((id) => String(id));

  let subscriptionByShopId = new Map();
  if (shopIds.length > 0) {
    const { Subscription } = await getSmartDukaModels();
    const subscriptions = await Subscription.find({ shop: { $in: shopIds } })
      .select('shop status')
      .lean();
    subscriptionByShopId = new Map(subscriptions.map((s) => [String(s.shop), s]));
  }

  return onboardingRows.map((onboarding) => {
    const plain = typeof onboarding.toObject === 'function' ? onboarding.toObject() : onboarding;
    const subscription = onboarding.shopId ? subscriptionByShopId.get(String(onboarding.shopId)) ?? null : null;
    return { ...plain, displayStage: resolveDisplayStage(onboarding, subscription) };
  });
}

/**
 * Joins a set of onboarding rows against their linked shops' basic identity
 * (name/email/isActive) — the shop-side counterpart to attachDisplayStage.
 * Rows with no shopId get `shop: null`.
 */
export async function attachShopSummary(onboardingRows) {
  const shopIds = onboardingRows
    .map((o) => o.shopId)
    .filter(Boolean)
    .map((id) => String(id));

  let shopById = new Map();
  if (shopIds.length > 0) {
    const { Shop } = await getSmartDukaModels();
    const shops = await Shop.find({ _id: { $in: shopIds } })
      .select('name email phone isActive')
      .lean();
    shopById = new Map(shops.map((s) => [String(s._id), s]));
  }

  return onboardingRows.map((onboarding) => {
    const plain = typeof onboarding.toObject === 'function' ? onboarding.toObject() : onboarding;
    return { ...plain, shop: onboarding.shopId ? shopById.get(String(onboarding.shopId)) ?? null : null };
  });
}
