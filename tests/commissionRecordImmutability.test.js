import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CommissionRecord, { assertCommissionRecordImmutable } from '../src/models/admin/CommissionRecord.js';

const FIXED_IDS = {
  agentId: new mongoose.Types.ObjectId(),
  shopId: new mongoose.Types.ObjectId(),
  onboardingId: new mongoose.Types.ObjectId(),
  sourceTransactionId: new mongoose.Types.ObjectId(),
  ruleId: new mongoose.Types.ObjectId(),
};

function baseFields(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    agentId: FIXED_IDS.agentId,
    shopId: FIXED_IDS.shopId,
    onboardingId: FIXED_IDS.onboardingId,
    sourceTransactionType: 'subscription_payment',
    sourceTransactionId: FIXED_IDS.sourceTransactionId,
    originalAmount: 1000,
    currency: 'KES',
    ruleId: FIXED_IDS.ruleId,
    ruleType: 'percentage',
    ruleValue: 10,
    commissionAmount: 100,
    status: 'pending',
    ...overrides,
  };
}

test('a brand-new (unsaved) document is exempt from the immutability guard', () => {
  const doc = new CommissionRecord(baseFields());
  assert.equal(doc.isNew, true);
  assert.doesNotThrow(() => assertCommissionRecordImmutable(doc));
});

// Model.hydrate() builds a document as if it were loaded from the DB —
// isNew: false and no paths marked modified — without needing a live
// connection. This is what lets the immutability guard be exercised
// end-to-end (construct → simulate "existing" → mutate → assert) as a pure
// node:test, no mongod required.
test('editing a non-frozen field (status) on an existing record is allowed', () => {
  const existing = CommissionRecord.hydrate(baseFields());
  assert.equal(existing.isNew, false);

  existing.status = 'approved';
  assert.doesNotThrow(() => assertCommissionRecordImmutable(existing));
});

test('editing originalAmount on an existing record is rejected', () => {
  const existing = CommissionRecord.hydrate(baseFields());
  existing.originalAmount = 999999;
  assert.throws(
    () => assertCommissionRecordImmutable(existing),
    /originalAmount cannot be modified/
  );
});

test('editing commissionAmount, ruleType, ruleValue, or ruleId on an existing record is each rejected', () => {
  for (const [field, value] of [
    ['commissionAmount', 5],
    ['ruleType', 'fixed'],
    ['ruleValue', 999],
    ['ruleId', new mongoose.Types.ObjectId()],
  ]) {
    const existing = CommissionRecord.hydrate(baseFields());
    existing[field] = value;
    assert.throws(
      () => assertCommissionRecordImmutable(existing),
      new RegExp(`${field} cannot be modified`),
      `expected ${field} mutation to be rejected`
    );
  }
});

test('the accrual idempotency index is declared: unique on {sourceTransactionType, sourceTransactionId}', () => {
  const indexes = CommissionRecord.schema.indexes();
  const match = indexes.find(([fields]) => fields.sourceTransactionType === 1 && fields.sourceTransactionId === 1);
  assert.ok(match, 'expected a compound index on sourceTransactionType + sourceTransactionId');
  assert.equal(match[1].unique, true);
});
