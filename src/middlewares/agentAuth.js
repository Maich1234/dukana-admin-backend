import jwt from 'jsonwebtoken';
import Agent from '../models/admin/Agent.js';
import Onboarding from '../models/admin/Onboarding.js';

/**
 * Gates /agent/* routes. Verifies against AGENT_JWT_SECRET and requires the
 * `type: 'agent'` claim. Agents are a wholly separate principal from
 * AdminUser — no role, no permissions array; every agent route scopes
 * queries to req.agent._id directly rather than consulting any permission.
 */
export const protectAgent = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer')) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.AGENT_JWT_SECRET);
    if (decoded.type !== 'agent') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const agent = await Agent.findById(decoded.id).select('-password');
    if (!agent) {
      return res.status(401).json({ success: false, message: 'Agent not found' });
    }
    if (!agent.active) {
      return res.status(401).json({ success: false, message: 'Agent account deactivated' });
    }

    req.agent = agent;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

/**
 * Loads the :id-referenced Onboarding row and confirms it belongs to the
 * calling agent. Returns 404 — not 403 — on a mismatch, so an agent probing
 * another agent's onboarding ids can't even learn that the id exists.
 * Attaches the loaded doc as req.onboarding so the controller doesn't
 * re-fetch it.
 */
export const requireAssignedOnboarding = async (req, res, next) => {
  const onboarding = await Onboarding.findOne({ _id: req.params.id, agentId: req.agent._id });
  if (!onboarding) {
    return res.status(404).json({ success: false, message: 'Onboarding record not found' });
  }
  req.onboarding = onboarding;
  next();
};

/**
 * Confirms the :shopId-referenced shop is assigned to the calling agent (via
 * its linked Onboarding row) before letting a shop-scoped agent route
 * proceed. Same 404-not-403 policy as requireAssignedOnboarding.
 */
export const requireAssignedShop = async (req, res, next) => {
  const shopId = req.params.shopId ?? req.params.id;
  const onboarding = await Onboarding.findOne({ shopId, agentId: req.agent._id });
  if (!onboarding) {
    return res.status(404).json({ success: false, message: 'Shop not found' });
  }
  req.onboarding = onboarding;
  next();
};
