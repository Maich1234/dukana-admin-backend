import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeReferralCode, nextReferralCode } from '../src/utils/referralCode.js';

// This file is a deliberate duplicate of
// smart-duka-backend/tests/referralCode.test.js, mirroring the deliberate
// duplicate of src/utils/referralCode.js itself (see that file's header
// comment — Agent lives in a separate database from Shop/User, so the two
// backends each need their own copy of the encoding). Fixed expected values
// below are a regression guard that the two hand-maintained copies of the
// algorithm haven't drifted apart.

const fakeCounterModel = (seeds = {}) => {
  const counters = { ...seeds };
  return {
    counters,
    async findOneAndUpdate(filter, update, options) {
      const key = filter._id;
      if (!(key in counters) && !options?.upsert) return null;
      counters[key] = (counters[key] ?? 0) + update.$inc.seq;
      return { seq: counters[key] };
    },
  };
};

test('the 3rd character is always a digit', () => {
  for (let n = 0; n < 500; n += 1) {
    const code = encodeReferralCode('A', n);
    assert.equal(code.length, 6);
    assert.match(code[2], /[2-9]/);
  }
});

test('agent codes start with "A" and never collide with shop/staff codes for the same n', () => {
  for (let n = 0; n < 5000; n += 1) {
    const agent = encodeReferralCode('A', n);
    assert.equal(agent[0], 'A');
    assert.notEqual(agent, encodeReferralCode('S', n));
    assert.notEqual(agent, encodeReferralCode('E', n));
  }
});

test('matches smart-duka-backend\'s encoding for fixed sample values (drift guard)', () => {
  assert.equal(encodeReferralCode('S', 0), 'SA2AAA');
  assert.equal(encodeReferralCode('E', 0), 'EA2AAA');
  assert.equal(encodeReferralCode('A', 0), 'AA2AAA');
  assert.equal(encodeReferralCode('A', 12345), encodeReferralCode('A', 12345));
});

test('sequential n values never produce a duplicate agent code', () => {
  const seen = new Set();
  for (let n = 0; n < 20000; n += 1) {
    const code = encodeReferralCode('A', n);
    assert.equal(seen.has(code), false, `duplicate code ${code} at n=${n}`);
    seen.add(code);
  }
});

test('nextReferralCode never repeats under concurrent calls (Promise.all)', async () => {
  const Counter = fakeCounterModel({ agent_referral_code: 0 });
  const results = await Promise.all(
    Array.from({ length: 200 }, () => nextReferralCode('A', 'agent_referral_code', { CounterModel: Counter })),
  );
  assert.equal(new Set(results).size, results.length);
});
