import jwt from 'jsonwebtoken';

/**
 * Signs an admin access JWT against ADMIN_JWT_SECRET with a `type: 'admin'`
 * claim, so an Agent token (signed with AGENT_JWT_SECRET) or a shop-side
 * smart-duka-backend token (a different secret, different service entirely)
 * can never authenticate as admin here, regardless of payload shape.
 */
const generateAdminToken = (id) => {
  return jwt.sign({ id, type: 'admin' }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '1h',
  });
};

export default generateAdminToken;
