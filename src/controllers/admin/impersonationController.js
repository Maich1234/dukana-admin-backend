import { getSmartDukaModels } from '../../models/smartduka/index.js';
import { mintImpersonationToken } from '../../services/internalApiClient.js';
import { logAudit } from '../../services/auditLogService.js';

/**
 * POST /admin/shops/:shopId/users/:userId/impersonate — lets a permitted
 * admin open smart-duka-web already logged in as this shop's owner or a
 * staff member, for support. The session itself is minted by
 * smart-duka-backend (the only service holding JWT_SECRET); this just
 * validates the target belongs to the shop and logs the action.
 */
export const impersonateUser = async (req, res) => {
  const { shopId, userId } = req.params;

  const { User } = await getSmartDukaModels();
  const user = await User.findOne({ _id: userId, shop: shopId }).select('name email role isActive').lean();
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found for this shop' });
  }

  const data = await mintImpersonationToken(userId, {
    adminId: req.admin._id,
    adminEmail: req.admin.email,
    reason: req.body?.reason,
  });

  logAudit({
    shopId,
    adminId: req.admin._id,
    action: 'admin.shop.impersonated',
    entityType: 'User',
    entityId: userId,
    details: { targetEmail: user.email, targetRole: user.role, reason: req.body?.reason ?? '' },
    req,
  }).catch(() => {});

  res.json({ success: true, data: { token: data.token, expiresIn: data.expiresIn, targetUser: data.user } });
};
