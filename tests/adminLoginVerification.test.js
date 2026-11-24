import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import AdminLoginChallenge from '../src/models/admin/AdminLoginChallenge.js';
import AdminUser from '../src/models/admin/AdminUser.js';
import { verifyAdminLoginCode } from '../src/services/adminLoginVerification.js';

test('an admin sign-in code can be consumed by only one request', async (t) => {
  const secret = 'admin-login-test-secret';
  const previousSecret = process.env.ADMIN_JWT_SECRET;
  process.env.ADMIN_JWT_SECRET = secret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.ADMIN_JWT_SECRET;
    else process.env.ADMIN_JWT_SECRET = previousSecret;
  });

  const admin = { _id: 'admin-id', email: 'admin@example.com', password: 'password-hash', roleId: { _id: 'role-id' } };
  const challengeId = 'fake-challenge';
  const code = '123456';
  const codeHash = createHmac('sha256', secret)
    .update(JSON.stringify(['admin-login', admin._id, admin.email, admin.password, admin.roleId._id, challengeId, code]))
    .digest('hex');
  let consumed = false;
  t.mock.method(AdminLoginChallenge, 'findOneAndUpdate', async (filter) => {
    assert.equal(filter.challengeId, challengeId);
    assert.equal(filter.attempts.$lt, 5);
    assert.equal(filter.consumedAt, null);
    return { _id: admin._id, codeHash };
  });
  t.mock.method(AdminUser, 'findOne', () => ({ populate: async () => admin }));
  t.mock.method(AdminLoginChallenge, 'updateOne', async (filter) => {
    assert.equal(filter.consumedAt, null);
    if (consumed) return { modifiedCount: 0 };
    consumed = true;
    return { modifiedCount: 1 };
  });

  assert.equal(await verifyAdminLoginCode(challengeId, '000000'), null);
  const results = await Promise.all([verifyAdminLoginCode(challengeId, code), verifyAdminLoginCode(challengeId, code)]);
  assert.equal(results.filter(Boolean).length, 1);
});
