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
  // B2C (paying agent commissions out) — kept in lockstep with
  // smart-duka-backend/src/models/PlatformConfig.js's copy. Must NEVER drift:
  // updatePlatformConfig below does a whole-subdocument reassignment through
  // THIS schema, so a field missing here gets silently stripped from the DB
  // document on the next unrelated platform-config save.
  initiatorName: { type: String, trim: true },
  securityCredential: { type: String },
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
// smart-duka-backend/src/models/PlatformConfig.js — three independent
// referral programs (shop owners, employees, agents), each with its own
// enable switch and date window. See settingsRoutes.js's
// /admin/settings/referral endpoints and referralController.js.
const referralAudienceBaseFields = {
  enabled: { type: Boolean, default: false },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
};

const shopOwnerReferralSchema = new mongoose.Schema({
  ...referralAudienceBaseFields,
  percentPerReferral: { type: Number, default: 20, min: 0, max: 100 },
  maxStackedPercent: { type: Number, default: 100, min: 0, max: 100 },
}, { _id: false });

const employeeReferralSchema = new mongoose.Schema({
  ...referralAudienceBaseFields,
  cashAmount: { type: Number, default: 0, min: 0 },
}, { _id: false });

// No reward field — agent payouts stay on CommissionRule/CommissionRecord;
// this only gates auto-linking an Onboarding row on redemption. trialDays is
// kept in lockstep with smart-duka-backend/src/models/PlatformConfig.js's
// copy — see that file's comment on the schema-drift risk.
const agentReferralSchema = new mongoose.Schema({
  ...referralAudienceBaseFields,
  trialDays: { type: Number, default: 30, min: 0 },
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
  referral: {
    shopOwner: { type: shopOwnerReferralSchema, default: () => ({}) },
    employee: { type: employeeReferralSchema, default: () => ({}) },
    agent: { type: agentReferralSchema, default: () => ({}) },
  },
}, { timestamps: true });

/** Loads the singleton, creating an empty one on first access. */
platformConfigSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

export default platformConfigSchema;
