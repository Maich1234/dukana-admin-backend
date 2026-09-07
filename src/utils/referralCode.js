import ReferralCodeCounter from '../models/admin/ReferralCodeCounter.js';

// Deliberate duplicate of smart-duka-backend/src/utils/referralCode.js.
// Agent lives in this backend's own database, unreachable from
// smart-duka-backend's connection, so the two backends each need their own
// copy of the encoding rather than a shared package. Keep the alphabet and
// encoding below in lockstep with that file — 'A' (agent) must stay disjoint
// from its 'S'/'E' (shop/staff) code spaces.
const ALNUM = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 symbols
const DIGITS = '23456789'; // 8 symbols

/** See smart-duka-backend/src/utils/referralCode.js for the full algorithm doc. */
export function encodeReferralCode(typeChar, n) {
  let rest = n;
  const digitIdx = rest % DIGITS.length;
  rest = Math.floor(rest / DIGITS.length);
  const c1 = ALNUM[rest % ALNUM.length];
  rest = Math.floor(rest / ALNUM.length);
  const c3 = ALNUM[rest % ALNUM.length];
  rest = Math.floor(rest / ALNUM.length);
  const c4 = ALNUM[rest % ALNUM.length];
  rest = Math.floor(rest / ALNUM.length);
  const c5 = ALNUM[rest % ALNUM.length];
  rest = Math.floor(rest / ALNUM.length);
  if (rest > 0) {
    throw new Error(`Referral code space exhausted for type "${typeChar}" (n=${n})`);
  }
  return `${typeChar}${c1}${DIGITS[digitIdx]}${c3}${c4}${c5}`;
}

export async function nextReferralCode(typeChar, counterKey, { CounterModel = ReferralCodeCounter } = {}) {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return encodeReferralCode(typeChar, counter.seq - 1);
}

export const generateAgentReferralCode = () => nextReferralCode('A', 'agent_referral_code');
