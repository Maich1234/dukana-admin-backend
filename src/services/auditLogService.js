import AuditLog from '../models/admin/AuditLog.js';

/**
 * Records an immutable audit event to this backend's own (admin-DB) AuditLog
 * — a brand-new, empty-at-launch trail, separate from smart-duka-backend's
 * own audit log. Every mutating controller in this app calls this as a side
 * effect; never throws — a logging failure must not break the primary
 * operation.
 *
 * @param {Object} opts
 * @param {import('mongoose').Types.ObjectId|string} [opts.shopId] - Omit for platform-scoped (non-shop) actions
 * @param {import('mongoose').Types.ObjectId|string} [opts.adminId] - The AdminUser who performed the action. Omit for an agent-performed mutation — put the agent's identity in `details` instead (see AuditLog.js's field comment).
 * @param {string} opts.action - Dot-namespaced e.g. 'admin.subscription.grace_extended'
 * @param {string} [opts.entityType]
 * @param {import('mongoose').Types.ObjectId|string} [opts.entityId]
 * @param {Object} [opts.details] - Non-sensitive context (no credentials)
 * @param {import('express').Request} [opts.req] - Used to extract IP + user agent
 */
export async function logAudit({ shopId, adminId, action, entityType, entityId, details, req }) {
  try {
    await AuditLog.create({
      shopId,
      adminId,
      action,
      entityType,
      entityId,
      details,
      ipAddress: req?.ip ?? req?.headers?.['x-forwarded-for']?.split(',')[0],
      userAgent: req?.headers?.['user-agent'],
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit event:', action, err.message);
  }
}
