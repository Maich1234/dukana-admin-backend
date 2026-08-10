import connectSmartDuka from '../../config/smartDukaDb.js';
import shopSchema from './shopSchema.js';
import userSchema from './userSchema.js';
import subscriptionSchema from './subscriptionSchema.js';
import subscriptionPlanSchema from './subscriptionPlanSchema.js';
import platformConfigSchema from './platformConfigSchema.js';
import platformConfigVerificationSessionSchema from './platformConfigVerificationSessionSchema.js';
import promotionSchema from './promotionSchema.js';
import pushCampaignSchema from './pushCampaignSchema.js';
import subscriptionPaymentSchema from './subscriptionPaymentSchema.js';
import mpesaTransactionSchema from './mpesaTransactionSchema.js';

// Binds every shared schema to the secondary (smart-duka) connection and
// caches the resulting models — every controller that touches a
// smart-duka-owned collection calls `const { Shop, Subscription } = await
// getSmartDukaModels();` instead of importing a model directly, since a
// plain Schema has nothing to query until it's bound to a live connection.
//
// Binding happens once per connection (re-registering a model name on the
// same connection throws), guarded by a module-level cache keyed off the
// connection itself so this is safe to call from every request.
const MODEL_DEFS = [
  ['Shop', shopSchema],
  ['User', userSchema],
  ['Subscription', subscriptionSchema],
  ['SubscriptionPlan', subscriptionPlanSchema],
  ['PlatformConfig', platformConfigSchema],
  ['PlatformConfigVerificationSession', platformConfigVerificationSessionSchema],
  ['Promotion', promotionSchema],
  ['PushCampaign', pushCampaignSchema],
  ['SubscriptionPayment', subscriptionPaymentSchema],
  ['MpesaTransaction', mpesaTransactionSchema],
];

let cachedModels = null;
let cachedConnection = null;

export const getSmartDukaModels = async () => {
  const connection = await connectSmartDuka();

  // A fresh connection (e.g. after a cold-start reconnect) needs its models
  // re-bound — reuse the cache only while it's still the same live connection.
  if (cachedModels && cachedConnection === connection) {
    return cachedModels;
  }

  const models = {};
  for (const [name, schema] of MODEL_DEFS) {
    models[name] = connection.models[name] || connection.model(name, schema);
  }

  cachedModels = models;
  cachedConnection = connection;
  return cachedModels;
};
