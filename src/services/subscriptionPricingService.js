// Ported (deriveAccess only) from
// smart-duka-backend/src/services/subscriptionPricingService.js — needed by
// the shops/subscriptions/dashboard controllers this backend ports, which
// all display a shop's access state. Not in the plan's explicit file list,
// but pulled in because adminShopsController.js/adminSubscriptionsController.js
// depend on it directly and it's a small, pure, side-effect-free function
// (no DB access — everything it needs is passed in).
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Derives a shop's real access state from its subscription record and the
 * clock — the single source of truth for banners, reminders, and the lock
 * screen on the shop side. Stored status never needs a cron to flip it.
 *
 * States:
 *  none      — no subscription yet (offer the trial)
 *  trialing  — inside the free trial          (daysLeft until trialEnd)
 *  active    — inside a paid period           (daysLeft until currentPeriodEnd)
 *  grace     — expired, within gracePeriodDays (graceDaysLeft until lock)
 *  locked    — expired and grace exhausted
 * cancelled subscriptions keep access until whatever period was already
 * paid/granted runs out, then go straight through grace → locked.
 */
export function deriveAccess(subscription, gracePeriodDays = 3, now = new Date()) {
  if (!subscription) {
    return { state: 'none', daysLeft: 0, graceDaysLeft: 0, expiresAt: null, cancelled: false };
  }

  // Support-granted breathing room extends the window for this shop only.
  gracePeriodDays += subscription.graceExtensionDays ?? 0;

  const cancelled = subscription.status === 'cancelled';
  const paidEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const trialEnd = subscription.trialEnd ? new Date(subscription.trialEnd) : null;
  const expiresAt = [paidEnd, trialEnd]
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? null;

  if (!expiresAt) {
    return { state: 'none', daysLeft: 0, graceDaysLeft: 0, expiresAt: null, cancelled };
  }

  if (now <= expiresAt) {
    const daysLeft = Math.ceil((expiresAt - now) / DAY_MS);
    const inPaidPeriod = paidEnd && now <= paidEnd;
    return {
      state: inPaidPeriod ? 'active' : 'trialing',
      daysLeft,
      graceDaysLeft: 0,
      expiresAt,
      cancelled,
    };
  }

  const graceEnd = new Date(expiresAt.getTime() + gracePeriodDays * DAY_MS);
  if (now <= graceEnd) {
    return {
      state: 'grace',
      daysLeft: 0,
      graceDaysLeft: Math.ceil((graceEnd - now) / DAY_MS),
      expiresAt,
      cancelled,
    };
  }

  return { state: 'locked', daysLeft: 0, graceDaysLeft: 0, expiresAt, cancelled };
}
