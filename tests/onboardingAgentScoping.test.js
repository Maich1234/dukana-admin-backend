import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Onboarding from '../src/models/admin/Onboarding.js';
import { requireAssignedOnboarding, requireAssignedShop } from '../src/middlewares/agentAuth.js';

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

beforeEach(() => mock.restoreAll());

// IDOR guard (plan Phase 6, item 1): as Agent A, GET/PATCH an onboarding
// record assigned to Agent B must 404 — never 403, so an agent probing
// another agent's onboarding ids can't even confirm the id exists.
test('requireAssignedOnboarding: 404s (not 403) when the record belongs to a different agent', async () => {
  mock.method(Onboarding, 'findOne', async (filter) => {
    // The middleware must always scope by req.agent._id — never trust a
    // client-supplied filter — so assert the query itself is agent-scoped.
    assert.ok(filter.agentId, 'query must be scoped by agentId');
    return null; // no matching document for THIS agent
  });

  const req = { params: { id: 'anyid' }, agent: { _id: 'agent-A' } };
  const res = makeRes();
  let nextCalled = false;

  await requireAssignedOnboarding(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
  assert.equal(req.onboarding, undefined);
});

test('requireAssignedOnboarding: proceeds and attaches req.onboarding when the record belongs to the calling agent', async () => {
  const fakeDoc = { _id: 'onboarding-1', agentId: 'agent-A' };
  mock.method(Onboarding, 'findOne', async (filter) => {
    assert.equal(filter.agentId, 'agent-A');
    return fakeDoc;
  });

  const req = { params: { id: 'onboarding-1' }, agent: { _id: 'agent-A' } };
  const res = makeRes();
  let nextCalled = false;

  await requireAssignedOnboarding(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
  assert.equal(req.onboarding, fakeDoc);
});

test('requireAssignedShop: 404s when the shop is not assigned to the calling agent', async () => {
  mock.method(Onboarding, 'findOne', async (filter) => {
    assert.ok(filter.agentId);
    assert.ok(filter.shopId);
    return null;
  });

  const req = { params: { shopId: new mongoose.Types.ObjectId().toString() }, agent: { _id: 'agent-A' } };
  const res = makeRes();
  let nextCalled = false;

  await requireAssignedShop(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
});

test('requireAssignedShop: proceeds when the shop is assigned to the calling agent', async () => {
  const fakeDoc = { _id: 'onboarding-1', agentId: 'agent-A' };
  mock.method(Onboarding, 'findOne', async () => fakeDoc);

  const req = { params: { shopId: new mongoose.Types.ObjectId().toString() }, agent: { _id: 'agent-A' } };
  const res = makeRes();
  let nextCalled = false;

  await requireAssignedShop(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});
