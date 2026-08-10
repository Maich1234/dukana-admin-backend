import jwt from 'jsonwebtoken';

/**
 * Signs an agent access JWT against AGENT_JWT_SECRET with a `type: 'agent'`
 * claim — a wholly separate principal from AdminUser, own secret, own
 * session model. An Admin token can never authenticate as an agent here
 * (and vice versa), even if the two secrets were ever set to the same value
 * by accident, because the `type` claim is checked in addition to the
 * signature (see protectAgent/protectAdmin).
 */
const generateAgentToken = (id) => {
  return jwt.sign({ id, type: 'agent' }, process.env.AGENT_JWT_SECRET, {
    expiresIn: process.env.AGENT_JWT_EXPIRES_IN || '1h',
  });
};

export default generateAgentToken;
