import Agent from '../../models/admin/Agent.js';
import Onboarding from '../../models/admin/Onboarding.js';
import CommissionRecord from '../../models/admin/CommissionRecord.js';
import cloudinary from '../../config/cloudinary.js';
import { parsePagination } from '../../utils/pagination.js';
import { logAudit } from '../../services/auditLogService.js';
import { agentRefreshTokenService } from '../../services/refreshTokenService.js';
import { attachDisplayStage, attachShopSummary } from '../../services/onboardingService.js';
import { signAgentVerifyToken } from '../../utils/agentVerifyToken.js';

/** GET /admin/agents */
export const listAgents = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.status === 'active') filter.active = true;
  if (req.query.status === 'suspended') filter.active = false;

  const [agents, total] = await Promise.all([
    Agent.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Agent.countDocuments(filter),
  ]);
  res.json({ success: true, data: agents, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** POST /admin/agents */
export const createAgent = async (req, res) => {
  const agent = await Agent.create({ ...req.body, createdBy: req.admin._id });
  const response = agent.toObject();
  delete response.password;

  logAudit({
    adminId: req.admin._id,
    action: 'admin.agent.created',
    entityType: 'Agent',
    entityId: agent._id,
    details: { email: agent.email },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: response });
};

/**
 * GET /admin/agents/:id — profile plus assigned/active/pending pipeline
 * counts, current-period new/paid shops, and a commission summary.
 */
export const getAgent = async (req, res) => {
  const agent = await Agent.findById(req.params.id).select('-password');
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

  const startOfPeriod = new Date();
  startOfPeriod.setUTCDate(1);
  startOfPeriod.setUTCHours(0, 0, 0, 0);

  const [stageCounts, newShopsThisPeriod, commissionTotals] = await Promise.all([
    Onboarding.aggregate([
      { $match: { agentId: agent._id } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]),
    Onboarding.countDocuments({ agentId: agent._id, shopId: { $ne: null }, registeredAt: { $gte: startOfPeriod } }),
    CommissionRecord.aggregate([
      { $match: { agentId: agent._id } },
      { $group: { _id: '$status', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const assignedCount = stageCounts.reduce((sum, s) => sum + s.count, 0);
  const activeCount = stageCounts.find((s) => s._id === 'active')?.count ?? 0;
  const pendingCount = assignedCount - activeCount;

  res.json({
    success: true,
    data: {
      agent: { ...agent.toObject(), verifyToken: signAgentVerifyToken(agent._id) },
      pipeline: { assignedCount, activeCount, pendingCount, byStage: stageCounts },
      newShopsThisPeriod,
      commissions: {
        pending: commissionTotals.find((c) => c._id === 'pending')?.total ?? 0,
        approved: commissionTotals.find((c) => c._id === 'approved')?.total ?? 0,
        paid: commissionTotals.find((c) => c._id === 'paid')?.total ?? 0,
      },
    },
  });
};

/** POST /admin/agents/:id/photo — an admin setting/replacing an agent's photo. */
export const uploadAgentPhoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const agent = await Agent.findById(req.params.id);
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'agent-photos', public_id: `agent_${agent._id}`, overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(req.file.buffer);
  });

  agent.photoUrl = result.secure_url;
  await agent.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.agent.photo_updated',
    entityType: 'Agent',
    entityId: agent._id,
    req,
  }).catch(() => {});

  res.json({ success: true, data: { photoUrl: agent.photoUrl } });
};

/** PATCH /admin/agents/:id */
export const updateAgent = async (req, res) => {
  const agent = await Agent.findById(req.params.id);
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

  const { name, email, password, phone, active } = req.body;
  const wasActive = agent.active;

  if (name !== undefined) agent.name = name;
  if (email !== undefined) agent.email = email;
  if (password !== undefined) agent.password = password;
  if (phone !== undefined) agent.phone = phone;
  if (active !== undefined) agent.active = active;

  await agent.save();

  if (active === false && wasActive) {
    await agentRefreshTokenService.revokeAllSessions(agent._id, 'admin_force_logout');
  }

  logAudit({
    adminId: req.admin._id,
    action: 'admin.agent.updated',
    entityType: 'Agent',
    entityId: agent._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  const response = agent.toObject();
  delete response.password;
  res.json({ success: true, data: response });
};

/** PATCH /admin/agents/:id/suspend */
export const suspendAgent = async (req, res) => {
  const agent = await Agent.findById(req.params.id);
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

  agent.active = false;
  await agent.save();
  await agentRefreshTokenService.revokeAllSessions(agent._id, 'admin_force_logout');

  logAudit({
    adminId: req.admin._id,
    action: 'admin.agent.suspended',
    entityType: 'Agent',
    entityId: agent._id,
    details: { reason: req.body?.reason ?? '' },
    req,
  }).catch(() => {});

  res.json({ success: true, data: { _id: agent._id, active: agent.active } });
};

/** PATCH /admin/agents/:id/reactivate */
export const reactivateAgent = async (req, res) => {
  const agent = await Agent.findById(req.params.id);
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

  agent.active = true;
  await agent.save();

  logAudit({
    adminId: req.admin._id,
    action: 'admin.agent.reactivated',
    entityType: 'Agent',
    entityId: agent._id,
    req,
  }).catch(() => {});

  res.json({ success: true, data: { _id: agent._id, active: agent.active } });
};

/** GET /admin/agents/:id/shops — every shop (onboarding row) assigned to this agent. */
export const getAgentShops = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { agentId: req.params.id };
  const [rows, total] = await Promise.all([
    Onboarding.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Onboarding.countDocuments(filter),
  ]);

  const withShop = await attachShopSummary(rows);
  const data = await attachDisplayStage(withShop);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

/** GET /admin/agents/:id/commissions */
export const getAgentCommissions = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { agentId: req.params.id };
  if (req.query.status) filter.status = req.query.status;

  const [records, total] = await Promise.all([
    CommissionRecord.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CommissionRecord.countDocuments(filter),
  ]);
  res.json({ success: true, data: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
