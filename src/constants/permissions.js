// Fixed permission-constant list for the Role-based RBAC system (see
// models/admin/Role.js). Unlike smart-duka-backend's old two-value
// role+permissions[] scheme, permissions here are only ever attached to a
// Role, never directly to an AdminUser — "Mini Admin" / "Section Admin" are
// just ordinary Role rows built from a subset of this list via the Roles UI.
//
// super_admin (the seeded, protected system role) bypasses every one of
// these checks entirely — see requireSuperAdmin/requirePermission in
// middlewares/adminAuth.js. Agents never hold a roleId or any of these
// permissions at all; their access is scope-based, not permission-based.
export const PERMISSION_GROUPS = [
  {
    category: 'Shops',
    permissions: [
      { value: 'shops.view', label: 'View shops' },
      { value: 'shops.create', label: 'Create shops' },
      { value: 'shops.edit', label: 'Edit shop details' },
      { value: 'shops.suspend', label: 'Suspend / reactivate shops' },
    ],
  },
  {
    category: 'Agents',
    permissions: [
      { value: 'agents.view', label: 'View agents' },
      { value: 'agents.create', label: 'Create agents' },
      { value: 'agents.edit', label: 'Edit agents' },
      { value: 'agents.suspend', label: 'Suspend / reactivate agents' },
    ],
  },
  {
    category: 'Onboarding',
    permissions: [
      { value: 'onboarding.view', label: 'View onboarding pipeline' },
      { value: 'onboarding.manage', label: 'Manage leads & reassign agents' },
    ],
  },
  {
    category: 'Subscriptions',
    permissions: [
      { value: 'subscriptions.view', label: 'View subscriptions' },
      { value: 'subscriptions.manage', label: 'Manage subscriptions (grace extensions, reconciliation)' },
    ],
  },
  {
    category: 'Payments',
    permissions: [
      { value: 'payments.view', label: 'View subscription payments' },
    ],
  },
  {
    category: 'Commissions',
    permissions: [
      { value: 'commissions.view', label: 'View commission rules & records' },
      { value: 'commissions.manage', label: 'Manage commission rules & cancel records' },
      { value: 'commissions.approve', label: 'Approve / mark commissions as paid' },
    ],
  },
  {
    category: 'Support',
    permissions: [
      { value: 'support.view', label: 'View support tickets' },
      { value: 'support.manage', label: 'Manage support tickets' },
    ],
  },
  {
    category: 'Admins',
    permissions: [
      { value: 'admins.view', label: 'View admin accounts' },
      { value: 'admins.create', label: 'Create admin accounts' },
      { value: 'admins.edit', label: 'Edit admin accounts' },
      { value: 'admins.suspend', label: 'Suspend / reactivate admin accounts' },
    ],
  },
  {
    category: 'Audit',
    permissions: [
      { value: 'audit.view', label: 'View audit log' },
    ],
  },
  {
    category: 'Settings',
    permissions: [
      { value: 'settings.manage', label: 'Manage plans, promotions, push campaigns & platform config' },
    ],
  },
];

export const PERMISSION_VALUES = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.value));

/** Protected system role slug — hardcoded to bypass every permission check, never editable. */
export const SUPER_ADMIN_ROLE_SLUG = 'super_admin';
