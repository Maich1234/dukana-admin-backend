import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/PushCampaign.js.
// `createdBy` drops its original `ref: 'AdminUser'` — see subscriptionSchema.js's
// header comment for why (AdminUser now lives in the primary connection).
const segmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['all', 'state', 'plan', 'location'], required: true },
  states: { type: [String], default: [] },
  planSlugs: { type: [String], default: [] },
  country: { type: String, default: null },
  counties: { type: [String], default: [] },
  roles: { type: [String], enum: ['owner', 'staff'], default: ['owner'] },
}, { _id: false });

const statsSchema = new mongoose.Schema({
  targeted: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
}, { _id: false });

const pushCampaignSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  data: { type: Map, of: String, default: undefined },
  segment: { type: segmentSchema, required: true },
  status: {
    type: String,
    enum: ['scheduled', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'scheduled',
  },
  scheduledAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  stats: { type: statsSchema, default: () => ({}) },
  error: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

export default pushCampaignSchema;
