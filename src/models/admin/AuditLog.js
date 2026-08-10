import mongoose from 'mongoose';

// Brand-new, empty-at-launch audit trail, scoped only to actions performed
// through this system. Deliberately separate from smart-duka-backend's own
// `models/AuditLog.js` (which stays there, untouched, forever — it's read at
// runtime by shop-side business logic like dailySummaryService/shiftService
// and cannot be deleted or migrated). The one-time migration script copies
// only the historical `admin.*`-prefixed rows from the old collection here,
// for continuity.
//
// No `ref` on any ObjectId field: shopId/entityId may point at a document in
// either database depending on `entityType`, and adminId/agentId could in
// principle too if this log ever records something other than an admin
// action — resolving any of them is always a manual application-level join,
// never a populate().
const auditLogSchema = new mongoose.Schema({
  // Omitted for platform-scoped actions (e.g. platform payment credential
  // changes, admin/role management) that have no owning shop.
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  // The AdminUser who performed the action. Omitted for agent-performed
  // mutations (e.g. an agent updating their own onboarding lead) — those
  // instead carry the agent's identity inside `details` (agentId/agentEmail),
  // keeping this field's meaning ("which platform admin did this") exact
  // rather than overloading it with a second principal type.
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  // Dot-namespaced action descriptor, e.g. 'admin.subscription.grace_extended'
  action: { type: String, required: true, index: true },
  entityType: { type: String },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  // Non-sensitive context — never raw credentials.
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
}, {
  timestamps: true,
  versionKey: false,
});

export default mongoose.model('AuditLog', auditLogSchema);
