/**
 * One-time migration: copies existing platform-admin data out of
 * smart-duka-backend's database into this app's own admin database, so
 * cutover doesn't start every admin from scratch.
 *
 * Connects to SMARTDUKA_MONGODB_URI (source, READ-ONLY — this script never
 * writes there) and ADMIN_MONGODB_URI (target):
 *
 *  1. Copies every legacy `AdminUser` document verbatim (_id preserved,
 *     bcrypt hash is portable as-is) and, for each one, auto-creates a 1:1
 *     Role carrying an equivalent permission set — so nobody's access level
 *     changes on cutover. Skips (does not overwrite) any AdminUser id that
 *     already exists in the target — safe to re-run.
 *
 *  2. Copies only the historical `admin.*`-prefixed AuditLog rows into the
 *     new admin-DB AuditLog, for continuity. Everything else in the old
 *     AuditLog collection is left untouched — see the plan's "AuditLog is
 *     NOT admin-only" correction: that collection stays in
 *     smart-duka-backend forever, read at runtime by shop-side business
 *     logic (dailySummaryService/shiftService).
 *
 * The old RBAC shape (`role: 'super_admin'|'admin'` + a flat `permissions`
 * array of module keys like 'shops'/'plans'/'audit') doesn't line up
 * 1:1 with the new fine-grained permission list (models/admin/Role.js) —
 * the two systems' permission keys are genuinely different vocabularies, not
 * just renamed. LEGACY_PERMISSION_MAP below is this script's documented,
 * best-effort translation, chosen to preserve *at least* what each legacy
 * permission used to unlock, sometimes granting a slightly broader
 * equivalent (e.g. old 'shops' covered shop lookup, subscription view, and
 * grace-extension, so it maps to shops.view + subscriptions.view +
 * subscriptions.manage + payments.view). super_admin migrates to the seeded
 * super_admin system role regardless of its old `permissions` array (that
 * role always had every permission implicitly, exactly as before).
 *
 * Usage:
 *   node scripts/migrateFromSmartDuka.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import AdminUser from '../src/models/admin/AdminUser.js';
import Role from '../src/models/admin/Role.js';
import AuditLog from '../src/models/admin/AuditLog.js';
import { PERMISSION_VALUES, SUPER_ADMIN_ROLE_SLUG } from '../src/constants/permissions.js';

const LEGACY_PERMISSION_MAP = {
  shops: ['shops.view', 'subscriptions.view', 'subscriptions.manage', 'payments.view'],
  plans: ['settings.manage'],
  promotions: ['settings.manage'],
  push_campaigns: ['settings.manage'],
  platform_config: ['settings.manage'],
  audit: ['audit.view'],
};

// Minimal read-only shapes for the legacy collections — no behavior, just
// enough fields to read. Bound to their own connection so this never touches
// (or even could touch) the source database's schema/index config.
const legacyAdminUserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  active: Boolean,
  role: String,
  permissions: [String],
  createdBy: mongoose.Schema.Types.ObjectId,
  createdAt: Date,
  updatedAt: Date,
}, { strict: false });

const legacyAuditLogSchema = new mongoose.Schema({}, { strict: false });

async function migrateAdminUsers(sourceConn) {
  const LegacyAdminUser = sourceConn.model('AdminUser', legacyAdminUserSchema, 'adminusers');
  const legacyAdmins = await LegacyAdminUser.find().lean();

  let created = 0;
  let skipped = 0;

  for (const legacy of legacyAdmins) {
    const alreadyMigrated = await AdminUser.findById(legacy._id);
    if (alreadyMigrated) {
      skipped += 1;
      continue;
    }

    const role = legacy.role === 'super_admin'
      ? await ensureSuperAdminRole()
      : await createEquivalentRole(legacy);

    await AdminUser.create({
      _id: legacy._id,
      name: legacy.name,
      email: legacy.email,
      // Already a bcrypt hash — bcryptjs reads standard bcrypt hashes
      // regardless of which bcrypt implementation produced them, so this is
      // set directly rather than through the pre('save') hook (which would
      // try to re-hash an already-hashed value).
      password: legacy.password,
      active: legacy.active ?? true,
      roleId: role._id,
      createdBy: legacy.createdBy ?? null,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    });
    created += 1;
    console.log(`  migrated admin: ${legacy.email} → role "${role.slug}"`);
  }

  return { scanned: legacyAdmins.length, created, skipped };
}

let cachedSuperAdminRole = null;
async function ensureSuperAdminRole() {
  if (cachedSuperAdminRole) return cachedSuperAdminRole;
  let role = await Role.findOne({ slug: SUPER_ADMIN_ROLE_SLUG });
  if (!role) {
    role = await Role.create({
      slug: SUPER_ADMIN_ROLE_SLUG,
      name: 'Super Admin',
      description: 'Full, unrestricted access to every module. Bypasses permission checks entirely — protected, cannot be edited or deleted.',
      permissions: PERMISSION_VALUES,
      isSystemRole: true,
    });
  }
  cachedSuperAdminRole = role;
  return role;
}

/** One 1:1 Role per migrated non-super-admin, translated via LEGACY_PERMISSION_MAP. */
async function createEquivalentRole(legacyAdmin) {
  const translated = new Set();
  for (const legacyPerm of legacyAdmin.permissions ?? []) {
    for (const mapped of LEGACY_PERMISSION_MAP[legacyPerm] ?? []) {
      if (PERMISSION_VALUES.includes(mapped)) translated.add(mapped);
    }
  }

  const localPart = (legacyAdmin.email ?? 'admin').split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const slug = `migrated-${localPart}-${String(legacyAdmin._id).slice(-6)}`;

  return Role.create({
    slug,
    name: `${legacyAdmin.name ?? legacyAdmin.email} (migrated)`,
    description: `Auto-created during migration to preserve this admin's exact prior access level (was: ${(legacyAdmin.permissions ?? []).join(', ') || 'no permissions'}).`,
    permissions: [...translated],
    isSystemRole: false,
  });
}

async function migrateAuditLog(sourceConn) {
  const LegacyAuditLog = sourceConn.model('AuditLog', legacyAuditLogSchema, 'auditlogs');
  const legacyRows = await LegacyAuditLog.find({ action: { $regex: /^admin\./ } }).lean();

  let created = 0;
  let skipped = 0;

  for (const row of legacyRows) {
    const exists = await AuditLog.findById(row._id);
    if (exists) {
      skipped += 1;
      continue;
    }
    await AuditLog.create({
      _id: row._id,
      shopId: row.shopId ?? undefined,
      adminId: row.userId ?? undefined,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      details: row.details,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    created += 1;
  }

  return { scanned: legacyRows.length, created, skipped };
}

async function main() {
  if (!process.env.SMARTDUKA_MONGODB_URI) throw new Error('SMARTDUKA_MONGODB_URI is not set');
  if (!process.env.ADMIN_MONGODB_URI) throw new Error('ADMIN_MONGODB_URI is not set');

  // Target: the default connection, so the imported models (AdminUser/Role/
  // AuditLog, already bound via mongoose.model()) work against it directly.
  await mongoose.connect(process.env.ADMIN_MONGODB_URI);

  // Source: a second, independent connection — read-only, never written to.
  const sourceConn = await mongoose.createConnection(process.env.SMARTDUKA_MONGODB_URI).asPromise();

  console.log('Migrating AdminUser + Role...');
  const adminSummary = await migrateAdminUsers(sourceConn);
  console.log(`  scanned ${adminSummary.scanned}, created ${adminSummary.created}, skipped (already migrated) ${adminSummary.skipped}`);

  console.log('\nMigrating admin.* AuditLog rows...');
  const auditSummary = await migrateAuditLog(sourceConn);
  console.log(`  scanned ${auditSummary.scanned}, created ${auditSummary.created}, skipped (already migrated) ${auditSummary.skipped}`);

  await sourceConn.close();
  console.log('\nDone. Source database was never written to.');
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
