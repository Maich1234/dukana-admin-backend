// Gates /internal/* — service-to-service calls from smart-duka-backend, the
// reverse direction of internalApiClient.js's existing calls INTO that
// service. Same shared secret, same check — mirrors
// smart-duka-backend/src/middlewares/internalAuth.js exactly. Never a
// browser or the mobile app.
let warnedMissingSecret = false;

export const protectInternal = (req, res, next) => {
  if (!process.env.INTERNAL_API_SECRET) {
    if (!warnedMissingSecret) {
      console.error('[internal] INTERNAL_API_SECRET is not set on this server — every internal request will be rejected until it is configured.');
      warnedMissingSecret = true;
    }
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  const provided = req.headers.authorization?.replace('Bearer ', '');
  if (!provided || provided !== process.env.INTERNAL_API_SECRET) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  next();
};
