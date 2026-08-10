import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/SubscriptionPlan.js.
const subscriptionPlanSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: { type: String, required: true, trim: true },
  tagline: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  billingType: {
    type: String,
    enum: ['per_staff', 'flat'],
    required: true,
  },
  monthlyPrice: { type: Number, required: true, min: 0 },
  yearlyDiscountPercent: { type: Number, default: 20, min: 0, max: 100 },
  yearlyPrice: { type: Number, default: null, min: 0 },
  maxStaff: { type: Number, required: true, min: 1 },
  extraStaffPrice: { type: Number, default: 0, min: 0 },
  trialDays: { type: Number, default: 30, min: 0 },
  currency: { type: String, default: 'KES', uppercase: true, trim: true },
  highlights: { type: [String], default: [] },
  features: { type: [String], default: [] },
  badge: { type: String, default: '', trim: true },
  priceComparison: { type: String, default: '', trim: true },
  active: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  chatLimits: {
    maxConversations: { type: Number, default: null, min: 0 },
    maxNewConversationsPerDay: { type: Number, default: null, min: 0 },
    maxMessagesPerDay: { type: Number, default: null, min: 0 },
  },
}, { timestamps: true });

export default subscriptionPlanSchema;
