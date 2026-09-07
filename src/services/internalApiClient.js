// Thin client for smart-duka-backend's service-to-service /internal/*
// endpoints (routes/v1/internalRoutes.js there) — the two actions that need
// a live third-party call (Safaricom Daraja for payment reconciliation,
// Firebase Admin for push dispatch) and therefore can't be done as a plain
// second-connection DB write from this backend. See the plan's "V2
// evolution path" note: this is a deliberate, minimal down-payment on a
// harder service boundary, not the full one.
//
// Fails with a clear, catchable error rather than letting a network failure
// (SMARTDUKA_INTERNAL_API_URL unset, the other service down, a timeout)
// bubble up as an opaque 500 — callers surface `.message` directly to the
// admin.

class InternalApiError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'InternalApiError';
    this.status = status ?? 502;
    this.cause = cause;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

async function callInternalApi(path, { method = 'POST', body: requestBody } = {}) {
  const baseUrl = process.env.SMARTDUKA_INTERNAL_API_URL;
  const secret = process.env.INTERNAL_API_SECRET;

  if (!baseUrl || !secret) {
    throw new InternalApiError(
      'Internal API is not configured (SMARTDUKA_INTERNAL_API_URL / INTERNAL_API_SECRET missing). This action cannot be completed right now.',
      { status: 503 }
    );
  }

  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new InternalApiError(
      'Could not reach the Dukana core API to complete this action. Please try again shortly.',
      { cause: err }
    );
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body?.success) {
    throw new InternalApiError(
      body?.message || `The core API rejected this request (HTTP ${res.status}).`,
      { status: res.status }
    );
  }

  return body.data;
}

/**
 * POST /internal/subscriptions/payments/:paymentId/reconcile — re-verifies a
 * payment directly against Safaricom and activates the subscription if it
 * actually went through. Returns { paymentId, shopId, statusBefore, status,
 * periodEnd, activated, changed }.
 */
export const reconcileSubscriptionPayment = (paymentId) =>
  callInternalApi(`/internal/subscriptions/payments/${paymentId}/reconcile`);

/**
 * POST /internal/push-campaigns/:id/dispatch — claims and sends a push
 * campaign via Firebase Admin. Returns the updated PushCampaign document.
 */
export const dispatchPushCampaign = (campaignId) =>
  callInternalApi(`/internal/push-campaigns/${campaignId}/dispatch`);

/**
 * POST /internal/impersonation-token — mints a short-lived shop-user access
 * token so an admin can open the web app already logged in as a shop owner
 * or staff member. Returns { token, expiresIn, user }.
 */
export const mintImpersonationToken = (userId, { adminId, adminEmail, reason }) =>
  callInternalApi('/internal/impersonation-token', {
    method: 'POST',
    body: { userId, adminId, adminEmail, reason },
  });

/**
 * POST /internal/b2c/payout — initiates a B2C payment (e.g. an agent
 * commission payout) from the platform's own Daraja account. Returns
 * { conversationId, originatorConversationId }; the eventual result arrives
 * asynchronously via smart-duka-backend pushing to this service's own
 * POST /internal/commission-payouts/result.
 */
export const initiateB2CPayout = ({ reference, phoneNumber, amount, remarks, occasion }) =>
  callInternalApi('/internal/b2c/payout', {
    method: 'POST',
    body: { reference, phoneNumber, amount, remarks, occasion },
  });

export { InternalApiError };
