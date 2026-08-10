import Agent from '../../models/admin/Agent.js';
import generateAgentToken from '../../utils/generateAgentToken.js';
import { agentRefreshTokenService, RefreshTokenError } from '../../services/refreshTokenService.js';
import { logAudit } from '../../services/auditLogService.js';

/** POST /agent/auth/login */
export const login = async (req, res) => {
  const { email, password } = req.body;

  const agent = await Agent.findOne({ email });
  if (!agent) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!agent.active) {
    return res.status(401).json({ success: false, message: 'Agent account deactivated' });
  }

  const isPasswordMatch = await agent.comparePassword(password);
  if (!isPasswordMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const token = generateAgentToken(agent._id);
  const refreshToken = await agentRefreshTokenService.issueRefreshToken(agent._id, {
    deviceId: req.body?.deviceId,
    deviceName: req.body?.deviceName,
    platform: req.body?.platform,
  });

  agent.lastLoginAt = new Date();
  await agent.save();

  logAudit({
    action: 'agent.auth.login',
    entityType: 'Agent',
    entityId: agent._id,
    details: { agentId: String(agent._id), agentEmail: agent.email },
    req,
  }).catch(() => {});

  res.json({
    success: true,
    data: { id: agent._id, name: agent.name, email: agent.email, token, refreshToken },
  });
};

/** POST /agent/auth/refresh */
export const refresh = async (req, res) => {
  try {
    const { principalId, refreshToken } = await agentRefreshTokenService.rotateRefreshToken(req.body?.refreshToken);

    const agent = await Agent.findById(principalId).select('active');
    if (!agent || !agent.active) {
      return res.status(401).json({ success: false, message: 'Account is no longer active.' });
    }

    res.json({
      success: true,
      data: { token: generateAgentToken(principalId), refreshToken },
    });
  } catch (err) {
    if (err instanceof RefreshTokenError) {
      return res.status(401).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }
};

/** POST /agent/auth/logout */
export const logout = async (req, res) => {
  await agentRefreshTokenService.revokeRefreshToken(req.body?.refreshToken, 'manual_logout');
  res.json({ success: true, message: 'Logged out' });
};

/** GET /agent/auth/me */
export const getProfile = async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.agent._id,
      name: req.agent.name,
      email: req.agent.email,
      phone: req.agent.phone,
    },
  });
};
