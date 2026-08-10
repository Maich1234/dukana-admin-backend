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

// Approval-relay recipients for platformConfigVerificationService's OTP —
// editable only via the super-admin-gated approvers endpoint (see
// settingsRoutes.js). Deliberately not writable through the same PATCH as
// the rest of PlatformConfig: a regular admin with only `settings.manage`
// must never be able to repoint approvals at their own inbox and
// self-approve credential changes.
const platformApproverEmailsSchema = new mongoose.Schema({
  ceoEmail: { type: String, trim: true, lowercase: true, default: '' },
  approvedEmail: { type: String, trim: true, lowercase: true, default: '' },
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
}, { timestamps: true });

/** Loads the singleton, creating an empty one on first access. */
platformConfigSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

export default platformConfigSchema;
