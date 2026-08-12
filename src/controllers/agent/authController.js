import Agent from '../../models/admin/Agent.js';
import generateAgentToken from '../../utils/generateAgentToken.js';
import { agentRefreshTokenService, RefreshTokenError } from '../../services/refreshTokenService.js';
import { logAudit } from '../../services/auditLogService.js';
import { signAgentVerifyToken } from '../../utils/agentVerifyToken.js';
import cloudinary from '../../config/cloudinary.js';

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
      photoUrl: req.agent.photoUrl || null,
      // For the printable verification tag's QR code — see publicController.js.
      verifyToken: signAgentVerifyToken(req.agent._id),
    },
  });
};

/** POST /agent/profile/photo — an agent uploading their own photo. */
export const uploadOwnPhoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'agent-photos', public_id: `agent_${req.agent._id}`, overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(req.file.buffer);
  });

  req.agent.photoUrl = result.secure_url;
  await req.agent.save();

  res.json({ success: true, data: { photoUrl: req.agent.photoUrl } });
};
