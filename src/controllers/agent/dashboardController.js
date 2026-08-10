import Onboarding from '../../models/admin/Onboarding.js';
import CommissionRecord from '../../models/admin/CommissionRecord.js';

/** GET /agent/dashboard — scoped entirely to the calling agent. */
export const getDashboard = async (req, res) => {
  const agentId = req.agent._id;

  const [byStage, commissionsByStatus] = await Promise.all([
    Onboarding.aggregate([
      { $match: { agentId } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agentId } },
      { $group: { _id: '$status', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      onboarding: Object.fromEntries(byStage.map((s) => [s._id, s.count])),
      commissions: Object.fromEntries(commissionsByStatus.map((s) => [s._id, { total: s.total, count: s.count }])),
    },
  });
};
