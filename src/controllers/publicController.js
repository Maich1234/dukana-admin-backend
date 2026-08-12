import Agent from '../models/admin/Agent.js';
import { verifyAgentVerifyToken } from '../utils/agentVerifyToken.js';

/**
 * GET /public/agents/:token — unauthenticated. A shop owner scans an
 * agent's printed ID tag and lands here to confirm they're a real, currently
 * authorized Dukana field agent.
 *
 * A suspended agent (active:false) still resolves successfully — this is
 * the feature's actual security value. 404ing a suspended agent's tag would
 * read as "broken link, maybe offline"; returning active:false lets the
 * page show an unambiguous "authorization revoked" warning instead, so a
 * fired agent's old tag stops vouching for them the moment they're
 * suspended, not whenever someone happens to notice the tag looks stale.
 *
 * Summary-only response — no email/phone, matching the same privacy
 * convention as smart-duka-backend's public receipt/book-verification
 * endpoints (anyone holding the token, i.e. anyone who scans the QR, can
 * view this).
 */
export const getPublicAgent = async (req, res) => {
  const agentId = verifyAgentVerifyToken(req.params.token);
  if (!agentId) {
    return res.status(400).json({ success: false, message: 'Invalid or unrecognized verification code' });
  }

  const agent = await Agent.findById(agentId).select('name photoUrl active createdAt');
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }

  res.json({
    success: true,
    data: {
      name: agent.name,
      photoUrl: agent.photoUrl || null,
      active: agent.active,
      memberSince: agent.createdAt,
    },
  });
};
