/**
 * Bootstraps a Dukana platform super admin account. Most accounts are
 * created via the admin-management API (super_admin only, see
 * controllers/admin/adminsController.js); this script remains as a
 * break-glass bootstrap path independent of the API/DB app layer — e.g. for
 * creating the very first super_admin on a fresh environment, or recovering
 * if every super_admin is locked out. Mirrors
 * smart-duka-backend/scripts/createAdminUser.mjs.
 *
 * Usage:
 *   node scripts/createSuperAdminUser.mjs --email a@dukana.co --password ... --name "Ada Owner"
 *   node scripts/createSuperAdminUser.mjs --email a@dukana.co --password ... --name "Ada" --force   # reset password on an existing email
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import AdminUser from '../src/models/admin/AdminUser.js';
import Role from '../src/models/admin/Role.js';
import { PERMISSION_VALUES, SUPER_ADMIN_ROLE_SLUG } from '../src/constants/permissions.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const flag = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const email = flag('email');
const password = flag('password');
const name = flag('name');

async function ensureSuperAdminRole() {
  let role = await Role.findOne({ slug: SUPER_ADMIN_ROLE_SLUG });
  if (!role) {
    role = await Role.create({
      slug: SUPER_ADMIN_ROLE_SLUG,
      name: 'Super Admin',
      description: 'Full, unrestricted access to every module. Bypasses permission checks entirely — protected, cannot be edited or deleted.',
      permissions: PERMISSION_VALUES,
      isSystemRole: true,
    });
    console.log('Seeded missing super_admin role.');
  }
  return role;
}

async function main() {
  if (!email || !password || !name) {
    throw new Error('Usage: node scripts/createSuperAdminUser.mjs --email <email> --password <password> --name <name> [--force]');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  if (!process.env.ADMIN_MONGODB_URI) throw new Error('ADMIN_MONGODB_URI is not set');
  await mongoose.connect(process.env.ADMIN_MONGODB_URI);

  const role = await ensureSuperAdminRole();

  const existing = await AdminUser.findOne({ email: email.toLowerCase() });
  if (existing && !force) {
    console.log(`Admin "${email}" already exists. Use --force to reset their password and re-grant super_admin.`);
    return;
  }

  if (existing) {
    existing.password = password;
    existing.name = name;
    existing.active = true;
    existing.roleId = role._id;
    await existing.save();
    console.log(`Password reset for existing admin "${email}" (roleId re-set to super_admin).`);
    return;
  }

  await AdminUser.create({ email, password, name, roleId: role._id, active: true });
  console.log(`Super admin account created: ${email}`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
