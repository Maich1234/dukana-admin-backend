import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/PlatformConfig.js —
// Dukana's own company-level Daraja/Paystack credentials, a singleton
// document. Decrypted only inside smart-duka-backend's mpesaService/
// paystackService during live API calls; this backend only reads
// non-secret fields (getPlatformConfig) and re-encrypts new credential
// values on write (updatePlatformConfig), using the SAME ENCRYPTION_KEY as
// smart-duka-backend — see encryptionService.js.
const platformMpesaSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
  businessName: { type: String, trim: true },
  shortcode: { type: String, trim: true },
  consumerKey: { type: String },
  consumerSecret: { type: String },
  passkey: { type: String },
  configuredAt: { type: Date },
}, { _id: false });

const platformPaystackSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  publicKey: { type: String, trim: true },
  secretKey: { type: String },
  configuredAt: { type: Date },
}, { _id: false });

// Second approval-relay recipient for platformConfigVerificationService's
// OTP, on top of the CEO email — which is intentionally NOT here. The CEO
// address only ever comes from PLATFORM_CONFIG_APPROVER_EMAILS (env), so
// changing it requires literal server access; no API path writes it, even
// for a super admin. approvedEmail is the flexible one — editable via the
// super-admin-gated approvers endpoint (see settingsRoutes.js), deliberately
// not writable through the same PATCH as the rest of PlatformConfig, since a
// regular admin with only `settings.manage` must never be able to repoint
// approvals at their own inbox and self-approve credential changes.
const platformApproverEmailsSchema = new mongoose.Schema({
  approvedEmail: { type: String, trim: true, lowercase: true, default: '' },
}, { _id: false });

// Field-for-field copy of the `referral` sub-doc added to
// smart-duka-backend/src/models/PlatformConfig.js — the owner-to-owner
// referral program's admin-tunable rate/cap. See settingsRoutes.js's
// /admin/settings/referral endpoints.
const platformReferralSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  percentPerReferral: { type: Number, default: 20, min: 0, max: 100 },
  maxStackedPercent: { type: Number, default: 100, min: 0, max: 100 },
}, { _id: false });

const platformConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'platform', unique: true },
  mpesa: { type: platformMpesaSchema, default: () => ({}) },
  paystack: { type: platformPaystackSchema, default: () => ({}) },
  approverEmails: { type: platformApproverEmailsSchema, default: () => ({}) },
  immediateSeatBilling: { type: Boolean, default: false },
  gracePeriodDays: { type: Number, default: 3, min: 0 },
  staffGraceExtraDays: { type: Number, default: 7, min: 0 },
  reminderDaysBefore: { type: [Number], default: [7, 3] },
  referral: { type: platformReferralSchema, default: () => ({}) },
}, { timestamps: true });

/** Loads the singleton, creating an empty one on first access. */
platformConfigSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

export default platformConfigSchema;
