import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireSuperAdmin, requirePermission, requireSuperAdminForRoleChange } from '../src/middlewares/adminAuth.js';

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('requirePermission: super_admin bypasses regardless of its permissions list', () => {
  const req = { admin: { roleId: { slug: 'super_admin', permissions: [] } } };
  const res = makeRes();
  let nextCalled = false;
  requirePermission('shops.view')(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('requirePermission: a role without the permission is denied with 403', () => {
  const req = { admin: { roleId: { slug: 'support_admin', permissions: ['support.view'] } } };
  const res = makeRes();
  let nextCalled = false;
  requirePermission('shops.edit')(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('requirePermission: a role holding the exact permission is allowed', () => {
  const req = { admin: { roleId: { slug: 'support_admin', permissions: ['support.view', 'shops.edit'] } } };
  const res = makeRes();
  let nextCalled = false;
  requirePermission('shops.edit')(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireSuperAdmin: rejects any non-super_admin role, even one with every permission', () => {
  const req = { admin: { roleId: { slug: 'finance_section_admin', permissions: ['admins.view', 'admins.edit'] } } };
  const res = makeRes();
  let nextCalled = false;
  requireSuperAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('requireSuperAdmin: allows super_admin', () => {
  const req = { admin: { roleId: { slug: 'super_admin' } } };
  const res = makeRes();
  let nextCalled = false;
  requireSuperAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// Escalation guard: a Section Admin with admins.edit must never be able to
// change roleId (including granting super_admin) — see the plan's RBAC
// design section on this exact vector.
test('requireSuperAdminForRoleChange: no-op when the request body has no roleId', () => {
  const req = { admin: { roleId: { slug: 'finance_section_admin' } }, body: { name: 'New Name' } };
  const res = makeRes();
  let nextCalled = false;
  requireSuperAdminForRoleChange(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireSuperAdminForRoleChange: blocks a non-super-admin from setting roleId at all', () => {
  const req = { admin: { roleId: { slug: 'finance_section_admin' } }, body: { roleId: '507f1f77bcf86cd799439011' } };
  const res = makeRes();
  let nextCalled = false;
  requireSuperAdminForRoleChange(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('requireSuperAdminForRoleChange: allows a super admin to set roleId', () => {
  const req = { admin: { roleId: { slug: 'super_admin' } }, body: { roleId: '507f1f77bcf86cd799439011' } };
  const res = makeRes();
  let nextCalled = false;
  requireSuperAdminForRoleChange(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
