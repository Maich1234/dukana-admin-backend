import { getSmartDukaModels } from '../../../models/smartduka/index.js';
import { encrypt, isEncrypted } from '../../../services/encryptionService.js';
import { logAudit } from '../../../services/auditLogService.js';

/**
 * GET /admin/settings/platform-config — secret fields are NEVER sent to the
 * frontend, even encrypted. Only a "configured" boolean per secret, derived
 * from isEncrypted() on the stored value. Ungated by any step-up check
 * (unlike PATCH) — nothing here is worth an approval code.
 */
export const getPlatformConfig = async (req, res) => {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  const mpesa = platform.mpesa ?? {};
  const paystack = platform.paystack ?? {};

  if (req.method === 'GET') {
    logAudit({
      adminId: req.admin._id,
      action: 'admin.platform_config.viewed',
      req,
    }).catch(() => {});
  }

  res.json({
    success: true,
    data: {
      mpesa: {
        enabled: mpesa.enabled ?? false,
        environment: mpesa.environment ?? 'sandbox',
        businessName: mpesa.businessName ?? '',
        shortcode: mpesa.shortcode ?? '',
        consumerKeyConfigured: isEncrypted(mpesa.consumerKey),
        consumerSecretConfigured: isEncrypted(mpesa.consumerSecret),
        passkeyConfigured: isEncrypted(mpesa.passkey),
        configuredAt: mpesa.configuredAt ?? null,
      },
      paystack: {
        enabled: paystack.enabled ?? false,
        publicKey: paystack.publicKey ?? '',
        secretKeyConfigured: isEncrypted(paystack.secretKey),
        configuredAt: paystack.configuredAt ?? null,
      },
      immediateSeatBilling: platform.immediateSeatBilling ?? false,
      gracePeriodDays: platform.gracePeriodDays,
      staffGraceExtraDays: platform.staffGraceExtraDays,
      reminderDaysBefore: platform.reminderDaysBefore,
    },
  });
};

/**
 * PATCH /admin/settings/platform-config — credential fields are only
 * re-encrypted and overwritten when a non-empty value is actually sent; an
 * absent or empty field always means "leave the existing credential
 * unchanged". Uses the SAME ENCRYPTION_KEY as smart-duka-backend, since this
 * backend both reads and writes the credentials that service decrypts at
 * payment time.
 */
export const updatePlatformConfig = async (req, res) => {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  const {
    enabled, environment, businessName, shortcode, consumerKey, consumerSecret, passkey,
    paystackEnabled, paystackPublicKey, paystackSecretKey,
    immediateSeatBilling, gracePeriodDays, staffGraceExtraDays, reminderDaysBefore,
  } = req.body;

  const mpesa = platform.mpesa?.toObject ? platform.mpesa.toObject() : { ...(platform.mpesa ?? {}) };
  if (enabled !== undefined) mpesa.enabled = enabled;
  if (environment !== undefined) mpesa.environment = environment;
  if (businessName !== undefined) mpesa.businessName = businessName;
  if (shortcode !== undefined) mpesa.shortcode = shortcode;
  if (consumerKey) mpesa.consumerKey = encrypt(consumerKey);
  if (consumerSecret) mpesa.consumerSecret = encrypt(consumerSecret);
  if (passkey) mpesa.passkey = encrypt(passkey);
  if (consumerKey || consumerSecret || passkey || enabled !== undefined) mpesa.configuredAt = new Date();
  platform.mpesa = mpesa;

  const paystack = platform.paystack?.toObject ? platform.paystack.toObject() : { ...(platform.paystack ?? {}) };
  if (paystackEnabled !== undefined) paystack.enabled = paystackEnabled;
  if (paystackPublicKey !== undefined) paystack.publicKey = paystackPublicKey;
  if (paystackSecretKey) paystack.secretKey = encrypt(paystackSecretKey);
  if (paystackSecretKey || paystackPublicKey !== undefined || paystackEnabled !== undefined) paystack.configuredAt = new Date();
  platform.paystack = paystack;

  if (immediateSeatBilling !== undefined) platform.immediateSeatBilling = immediateSeatBilling;
  if (gracePeriodDays !== undefined) platform.gracePeriodDays = gracePeriodDays;
  if (staffGraceExtraDays !== undefined) platform.staffGraceExtraDays = staffGraceExtraDays;
  if (reminderDaysBefore !== undefined) platform.reminderDaysBefore = reminderDaysBefore;

  await platform.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.platform_config.updated',
    entityType: 'PlatformConfig',
    entityId: platform._id,
    // Field names only — never the values, which may be raw credentials.
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  return getPlatformConfig(req, res);
};

/**
 * GET /admin/settings/platform-config/approvers — the CEO/approved emails
 * that platformConfigVerificationService relays approval codes to.
 * `ceoEmail` is read straight from PLATFORM_CONFIG_APPROVER_EMAILS (env) —
 * included here purely for display, never writable via this or any other
 * API. Readable by anyone with settings.manage (so a non-super-admin knows
 * who to ask for a code); only the PATCH below is super-admin-gated.
 */
export const getPlatformConfigApprovers = async (req, res) => {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  res.json({
    success: true,
    data: {
      ceoEmail: process.env.PLATFORM_CONFIG_APPROVER_EMAILS ?? '',
      approvedEmail: platform.approverEmails?.approvedEmail ?? '',
    },
  });
};

/**
 * PATCH /admin/settings/platform-config/approvers — only writes
 * approvedEmail (see updatePlatformConfigApproversSchema, which doesn't even
 * accept a ceoEmail key). requireSuperAdmin is enforced at the route level
 * (see settingsRoutes.js), not here: this is the one write in the whole
 * Settings surface that a regular `settings.manage` admin must never reach,
 * since repointing this email at yourself would let you self-approve
 * platform credential changes. The CEO email has no write path at all —
 * changing it requires editing PLATFORM_CONFIG_APPROVER_EMAILS on the
 * server, which closes that escalation route even for a super admin.
 */
export const updatePlatformConfigApprovers = async (req, res) => {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  const { approvedEmail } = req.body;

  const approverEmails = platform.approverEmails?.toObject
    ? platform.approverEmails.toObject()
    : { ...(platform.approverEmails ?? {}) };
  approverEmails.approvedEmail = approvedEmail;
  platform.approverEmails = approverEmails;

  await platform.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.platform_config.approvers_updated',
    entityType: 'PlatformConfig',
    entityId: platform._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  return getPlatformConfigApprovers(req, res);
};
