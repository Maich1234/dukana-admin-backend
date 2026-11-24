import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import generateAdminToken from '../src/utils/generateAdminToken.js';
import { activeAdminSessionFilter, createRefreshTokenService } from '../src/services/refreshTokenService.js';

test('admin access JWTs expire after 60 seconds', (t) => {
  const previousSecret = process.env.ADMIN_JWT_SECRET;
  process.env.ADMIN_JWT_SECRET = 'admin-timeout-unit-test-secret';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.ADMIN_JWT_SECRET;
    else process.env.ADMIN_JWT_SECRET = previousSecret;
  });
  const claims = jwt.decode(generateAdminToken('admin-id', 'session-id'));
  assert.equal(claims.exp - claims.iat, 60);
});

test('admin requests and refreshes share the three-minute activity cutoff', (t) => {
  const previousSetting = process.env.ADMIN_LOGIN_VERIFICATION_REQUIRED;
  delete process.env.ADMIN_LOGIN_VERIFICATION_REQUIRED;
  t.after(() => {
    if (previousSetting !== undefined) process.env.ADMIN_LOGIN_VERIFICATION_REQUIRED = previousSetting;
  });
  const now = new Date('2026-01-01T12:00:00Z');
  assert.deepEqual(activeAdminSessionFilter(now), {
    revokedAt: null,
    expiresAt: { $gt: now },
    lastActivityAt: { $gt: new Date('2026-01-01T11:57:00Z') },
  });
  process.env.ADMIN_LOGIN_VERIFICATION_REQUIRED = 'true';
  assert.equal(activeAdminSessionFilter(now).loginVerified, true);
  delete process.env.ADMIN_LOGIN_VERIFICATION_REQUIRED;
});

test('rotating an admin token preserves its idle clock and absolute expiry', async () => {
  const lastActivityAt = new Date(Date.now() - 30_000);
  const expiresAt = new Date(Date.now() + 20 * 60_000);
  const transaction = {};
  const model = {
    db: { transaction: (callback) => callback(transaction) },
    findOneAndUpdate: async (filter, _update, options) => {
      assert.ok(filter.lastActivityAt.$gt < lastActivityAt);
      assert.equal(options.session, transaction);
      return { admin: 'admin-id', sessionId: 'session-id', expiresAt, lastActivityAt };
    },
    create: async ([token], options) => {
      assert.equal(options.session, transaction);
      assert.equal(token.sessionId, 'session-id');
      assert.equal(token.lastActivityAt, lastActivityAt);
      assert.equal(token.expiresAt, expiresAt);
    },
  };
  const service = createRefreshTokenService(model, 'admin');
  const result = await service.rotateRefreshToken('unit-test-refresh-token');
  assert.equal(result.sessionId, 'session-id');
  assert.equal(result.principalId, 'admin-id');
});
