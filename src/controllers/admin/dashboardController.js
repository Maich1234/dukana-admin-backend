import { getSmartDukaModels } from '../../models/smartduka/index.js';
import Agent from '../../models/admin/Agent.js';
import Onboarding from '../../models/admin/Onboarding.js';
import CommissionRecord from '../../models/admin/CommissionRecord.js';
import SupportTicket from '../../models/admin/SupportTicket.js';
import AuditLog from '../../models/admin/AuditLog.js';
import { SUPER_ADMIN_ROLE_SLUG } from '../../constants/permissions.js';

function startOfMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function hasPermission(admin, key) {
  return admin.roleId?.slug === SUPER_ADMIN_ROLE_SLUG || admin.roleId?.permissions?.includes(key);
}

// Each widget is computed independently and gated by its own permission —
// the whole point of this table is that the response is built up from only
// the widgets the caller can actually see, server-side, rather than the
// frontend hiding cards it received anyway.
const WIDGETS = [
  {
    key: 'shops',
    permission: 'shops.view',
    compute: async () => {
      const { Shop } = await getSmartDukaModels();
      const [total, active, newThisMonth] = await Promise.all([
        Shop.countDocuments(),
        Shop.countDocuments({ isActive: true }),
        Shop.countDocuments({ createdAt: { $gte: startOfMonth() } }),
      ]);
      return { total, active, suspended: total - active, newThisMonth };
    },
  },
  {
    key: 'subscriptions',
    permission: 'subscriptions.view',
    compute: async () => {
      const { Subscription } = await getSmartDukaModels();
      const byStatus = await Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
      return Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    },
  },
  {
    key: 'payments',
    permission: 'payments.view',
    compute: async () => {
      const { SubscriptionPayment } = await getSmartDukaModels();
      const [revenueThisMonth, todayCount] = await Promise.all([
        SubscriptionPayment.aggregate([
          { $match: { status: 'success', createdAt: { $gte: startOfMonth() } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        SubscriptionPayment.countDocuments({ createdAt: { $gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } }),
      ]);
      return {
        revenueThisMonth: revenueThisMonth[0]?.total ?? 0,
        successfulPaymentsThisMonth: revenueThisMonth[0]?.count ?? 0,
        paymentsToday: todayCount,
      };
    },
  },
  {
    key: 'agents',
    permission: 'agents.view',
    compute: async () => {
      const [total, active] = await Promise.all([
        Agent.countDocuments(),
        Agent.countDocuments({ active: true }),
      ]);
      return { total, active };
    },
  },
  {
    key: 'onboarding',
    permission: 'onboarding.view',
    compute: async () => {
      const byStage = await Onboarding.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]);
      return Object.fromEntries(byStage.map((s) => [s._id, s.count]));
    },
  },
  {
    key: 'commissions',
    permission: 'commissions.view',
    compute: async () => {
      const byStatus = await CommissionRecord.aggregate([
        { $group: { _id: '$status', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
      ]);
      return Object.fromEntries(byStatus.map((s) => [s._id, { total: s.total, count: s.count }]));
    },
  },
  {
    key: 'support',
    permission: 'support.view',
    compute: async () => {
      const [open, urgent] = await Promise.all([
        SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
        SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] }, priority: 'urgent' }),
      ]);
      return { open, urgent };
    },
  },
  {
    key: 'recentActivity',
    permission: 'audit.view',
    compute: async () => AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
  },
];

/** GET /admin/dashboard — protectAdmin only, no single fixed permission. */
export const getDashboard = async (req, res) => {
  const visibleWidgets = WIDGETS.filter((w) => hasPermission(req.admin, w.permission));
  const entries = await Promise.all(visibleWidgets.map(async (w) => [w.key, await w.compute()]));
  res.json({ success: true, data: Object.fromEntries(entries) });
};
