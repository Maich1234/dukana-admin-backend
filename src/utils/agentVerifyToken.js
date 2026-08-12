import jwt from 'jsonwebtoken';

/**
 * Signs a long-lived, stateless token identifying an agent for the public
 * verification page/QR tag. No expiry — a printed tag must stay scannable
 * indefinitely. Not persisted anywhere; recomputed on demand, mirroring
 * smart-duka-backend's receiptToken.js.
 *
 * Deliberately its own secret (AGENT_VERIFY_TOKEN_SECRET), never
 * AGENT_JWT_SECRET — that secret authenticates an agent's own login session;
 * this one is a long-lived, publicly-shareable token printed on a physical
 * badge. Different trust boundary, must not share a key: a leaked verify
 * token (which is meant to be public) must never be usable to forge a login
 * session, and vice versa.
 */
export const signAgentVerifyToken = (agentId) => {
  return jwt.sign({ agentId: agentId.toString() }, process.env.AGENT_VERIFY_TOKEN_SECRET);
};

export const verifyAgentVerifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.AGENT_VERIFY_TOKEN_SECRET);
    return decoded.agentId;
  } catch {
    return null;
  }
};
