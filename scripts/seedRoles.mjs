/**
 * Seeds the protected `super_admin` system role plus a handful of example
 * non-system roles, so a fresh environment has something to log in as and
 * something to demonstrate the "Mini Admin" / "Section Admin" pattern with.
 *
 * Idempotent — running this again updates the seeded rows' permissions/name/
 * description in place rather than erroring or duplicating them (matched by
 * slug).
 *
 * Usage:
 *   node scripts/seedRoles.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../src/models/admin/Role.js';
import { PERMISSION_VALUES, SUPER_ADMIN_ROLE_SLUG } from '../src/constants/permissions.js';

const EXAMPLE_ROLES = [
  {
    slug: SUPER_ADMIN_ROLE_SLUG,
    name: 'Super Admin',
    description: 'Full, unrestricted access to every module. Bypasses permission checks entirely — protected, cannot be edited or deleted.',
    permissions: PERMISSION_VALUES,
    isSystemRole: true,
  },
  {
    slug: 'finance_section_admin',
    name: 'Finance Section Admin',
    description: 'Subscription billing, payments, and agent commissions — no shop/admin management access.',
    permissions: ['subscriptions.view', 'subscriptions.manage', 'payments.view', 'commissions.view', 'commissions.manage', 'commissions.approve'],
    isSystemRole: false,
  },
  {
    slug: 'support_admin',
    name: 'Support Admin',
    description: 'Support tickets and read-only shop/subscription lookups for diagnosing customer issues.',
    permissions: ['shops.view', 'subscriptions.view', 'payments.view', 'support.view', 'support.manage'],
    isSystemRole: false,
  },
  {
    slug: 'onboarding_manager',
    name: 'Onboarding Manager',
    description: 'Manages the agent roster and onboarding pipeline — no financial or admin-account access.',
    permissions: ['agents.view', 'agents.create', 'agents.edit', 'agents.suspend', 'onboarding.view', 'onboarding.manage', 'shops.view'],
    isSystemRole: false,
  },
];

async function main() {
  if (!process.env.ADMIN_MONGODB_URI) throw new Error('ADMIN_MONGODB_URI is not set');
  await mongoose.connect(process.env.ADMIN_MONGODB_URI);

  for (const roleDef of EXAMPLE_ROLES) {
    const existing = await Role.findOne({ slug: roleDef.slug });
    if (existing) {
      // Never let a re-seed silently strip isSystemRole off the protected
      // role, even if a future edit to this script's shape got it wrong.
      existing.name = roleDef.name;
      existing.description = roleDef.description;
      existing.permissions = roleDef.permissions;
      existing.isSystemRole = roleDef.isSystemRole;
      await existing.save();
      console.log(`Updated existing role: ${roleDef.slug}`);
    } else {
      await Role.create(roleDef);
      console.log(`Created role: ${roleDef.slug}`);
    }
  }

  console.log(`\nDone. ${EXAMPLE_ROLES.length} role(s) seeded.`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
