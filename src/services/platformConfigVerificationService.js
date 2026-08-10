import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getSmartDukaModels } from '../models/smartduka/index.js';
import { sendEmail } from './email.js';

// Ported near-verbatim from
// smart-duka-backend/src/services/platformConfigVerificationService.js —
// pure email + JWT + DB, no third-party call, so it's safe to fully port
// rather than route through the internal API. The one structural change:
// PlatformConfigVerificationSession lives in the secondary (smart-duka)
// connection (it's one of the 10 shared schemas — see
// models/smartduka/index.js), so every DB access here resolves the model
// through getSmartDukaModels() instead of a static import.

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 8;

function generateOTP() {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0);
  return String(num % 1_000_000).padStart(6, '0');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, (m) => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

/**
 * CEO email + approved email, either of which can supply the code (the same
 * OTP is broadcast to both). DB-backed so a super admin can manage them from
 * the UI (see platformConfigController's getPlatformConfigApprovers/
 * updatePlatformConfigApprovers); PLATFORM_CONFIG_APPROVER_EMAILS is only a
 * bootstrap fallback for before either is ever set.
 */
async function approverEmails() {
  const { PlatformConfig } = await getSmartDukaModels();
  const platform = await PlatformConfig.get();
  const configured = [platform.approverEmails?.ceoEmail, platform.approverEmails?.approvedEmail]
    .map((e) => (e || '').trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;

  const raw = process.env.PLATFORM_CONFIG_APPROVER_EMAILS ?? '';
  return raw.split(',').map((e) => e.trim()).filter(Boolean);
}

async function sendApprovalEmail(approvers, admin, otp) {
  const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#0F766E;margin:0 0 8px">Dukana</h2>
        <p style="color:#64748B;margin:0 0 24px;font-size:14px">Platform Payment Credentials — Access Request</p>
        <p style="font-size:14px;color:#0F172A;margin:0 0 16px">
          <strong>${escapeHtml(admin.name)}</strong> (${escapeHtml(admin.email)}) is requesting access to view or
          change Dukana's platform Daraja/Paystack credentials. Only provide the code below if you
          expected and approve this request.
        </p>
        <div style="background:#F8FAFC;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <p style="margin:0 0 8px;font-size:14px;color:#64748B">Approval code</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0F172A;font-family:monospace">${otp}</div>
        </div>
        <p style="font-size:13px;color:#64748B;margin:0">
          This code expires in <strong>10 minutes</strong>. If you did not expect this request, do not share it —
          contact the team immediately.
        </p>
      </div>
    `;
  const text = `${admin.name} (${admin.email}) is requesting access to Dukana's platform Daraja/Paystack credentials.\nApproval code: ${otp}\nThis code expires in 10 minutes. If you did not expect this request, do not share it.`;

  const results = await Promise.allSettled(
    approvers.map((to) => sendEmail(to, 'Dukana — Platform Payment Credentials Access Request', html, text))
  );

  // With more than one approver configured, one flaky inbox must not orphan
  // a code that a different approver did receive — only fail if every send
  // failed.
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length === results.length) {
    throw failures[0].reason;
  }
  failures.forEach((f) => console.error('[PlatformConfigVerification] approval email failed:', f.reason));
}

/**
 * Requests a step-up code for platform payment-credential access. The code
 * is relayed through a fixed approver inbox — never the requesting admin's
 * own — so a compromised admin account can never self-approve. Fails closed
 * if no approver is configured.
 */
export async function requestPlatformConfigVerification(admin) {
  const approvers = await approverEmails();
  if (approvers.length === 0) {
    const err = new Error('No platform credential approver is configured. Ask a super admin to set the CEO or approved email in Settings.');
    err.statusCode = 500;
    throw err;
  }

  const { PlatformConfigVerificationSession } = await getSmartDukaModels();

  await PlatformConfigVerificationSession.deleteMany({ requestedByAdminId: admin._id, isUsed: false });

  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await sendApprovalEmail(approvers, admin, otp);

  const session = await PlatformConfigVerificationSession.create({
    requestedByAdminId: admin._id,
    otpHash,
    expiresAt,
  });

  return { sessionId: session._id.toString() };
}

/**
 * Validates the approval code. On success, issues a signed verification JWT
 * with a 10-minute lifetime. That token must accompany platform-config API
 * calls via the X-Verification-Token header.
 */
export async function verifyPlatformConfigCode(sessionId, code, adminId) {
  const { PlatformConfigVerificationSession } = await getSmartDukaModels();

  const session = await PlatformConfigVerificationSession.findOne({
    _id: sessionId,
    requestedByAdminId: adminId,
    isUsed: false,
  });

  if (!session) throw new Error('Verification session not found or already used.');
  if (new Date() > session.expiresAt) throw new Error('Verification code has expired. Please request a new one.');
  if (session.attempts >= MAX_ATTEMPTS) throw new Error('Too many failed attempts. Please request a new code.');

  const match = await bcrypt.compare(String(code), session.otpHash);
  if (!match) {
    session.attempts += 1;
    session.lastAttemptAt = new Date();
    await session.save();
    const remaining = MAX_ATTEMPTS - session.attempts;
    throw new Error(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
  }

  session.isUsed = true;
  await session.save();

  const token = jwt.sign(
    { adminId: adminId.toString(), purpose: 'platform_config', type: 'admin' },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '10m' }
  );

  return token;
}

const CREDENTIAL_FIELDS = ['consumerKey', 'consumerSecret', 'passkey', 'paystackSecretKey'];

/**
 * Express middleware: verifies the X-Verification-Token header, but only
 * when the request is actually writing a credential — an empty/absent field
 * means "leave unchanged" (see settings/platformConfigController.js), so
 * routine settings changes pass straight through without needing an
 * approver code at all. Must be placed after protectAdmin() so req.admin is set.
 */
export function requirePlatformConfigVerification(req, res, next) {
  const changingCredentials = CREDENTIAL_FIELDS.some((field) => req.body?.[field]);
  if (!changingCredentials) return next();

  const token = req.headers['x-verification-token'];
  if (!token) {
    return res.status(403).json({
      success: false,
      message: 'Approval verification required. Please complete verification before accessing platform payment settings.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (decoded.purpose !== 'platform_config') {
      return res.status(403).json({ success: false, message: 'Invalid verification token.' });
    }
    if (decoded.adminId !== req.admin._id.toString()) {
      return res.status(403).json({ success: false, message: 'Verification token mismatch.' });
    }
    req.platformConfigVerification = decoded;
    next();
  } catch {
    return res.status(403).json({
      success: false,
      message: 'Verification session expired. Please verify again.',
    });
  }
}
