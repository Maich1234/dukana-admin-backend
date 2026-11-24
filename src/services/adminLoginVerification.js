import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import AdminLoginChallenge from '../models/admin/AdminLoginChallenge.js';
import AdminUser from '../models/admin/AdminUser.js';
import { sendEmail } from './email.js';

export const adminLoginVerificationRequired = () => process.env.ADMIN_LOGIN_VERIFICATION_REQUIRED === 'true';

function hashCode(admin, challengeId, code) {
  return createHmac('sha256', process.env.ADMIN_JWT_SECRET)
    .update(JSON.stringify(['admin-login', String(admin._id), admin.email, admin.password, String(admin.roleId._id), challengeId, code]))
    .digest();
}

export async function requestAdminLoginCode(admin) {
  const now = Date.now();
  const challengeId = randomUUID();
  const code = String(randomInt(100000, 1000000));
  try {
    await AdminLoginChallenge.updateOne(
      { _id: admin._id, nextSendAt: { $lte: new Date(now) } },
      { $set: {
        challengeId,
        codeHash: hashCode(admin, challengeId, code).toString('hex'),
        attempts: 0,
        consumedAt: null,
        nextSendAt: new Date(now + 60_000),
        expiresAt: new Date(now + 5 * 60_000),
      } },
      { upsert: true },
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    return { retry: true };
  }

  const message = `Your DuQana admin sign-in code is ${code}. It expires in 5 minutes. Do not share it.`;
  try {
    await sendEmail(admin.email, 'DuQana admin sign-in code', `<p>${message}</p>`, message);
  } catch {
    return { deliveryFailed: true };
  }
  return { challengeId };
}

export async function verifyAdminLoginCode(challengeId, code) {
  const challenge = await AdminLoginChallenge.findOneAndUpdate(
    { challengeId, consumedAt: null, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
  );
  if (!challenge || !/^[a-f0-9]{64}$/.test(challenge.codeHash)) return null;

  const admin = await AdminUser.findOne({ _id: challenge._id, active: true }).populate('roleId');
  if (!admin?.roleId ||
      !timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), hashCode(admin, challengeId, code))) return null;

  const now = new Date();
  const consumed = await AdminLoginChallenge.updateOne(
    { _id: challenge._id, challengeId, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
  );
  return consumed.modifiedCount ? admin : null;
}
