import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/SubscriptionPayment.js.
// This is the collection commissionAccrualService reads (status: 'success')
// to drive agent commission accrual, and adminPaymentsController lists over
// — never MpesaTransaction, which is shop-till sales, a different concept.
const subscriptionPaymentSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true,
    index: true,
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
  },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
  staffCount: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'KES', uppercase: true, trim: true },
  provider: {
    type: String,
    enum: ['mpesa', 'card', 'bank'],
    required: true,
  },
  providerRef: { type: String, index: true },
  merchantRequestId: { type: String },
  phoneNumber: { type: String },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'],
    default: 'pending',
    index: true,
  },
  receipt: { type: String },
  transactionDate: { type: Date },
  periodStart: { type: Date },
  periodEnd: { type: Date },
  promotion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promotion',
    default: null,
  },
  promoCode: { type: String, default: null },
  promoDiscount: { type: Number, default: 0 },
  resultCode: { type: String },
  errorMessage: { type: String },
  callbackPayload: { type: mongoose.Schema.Types.Mixed },
  callbackReceivedAt: { type: Date },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  idempotencyKey: { type: String, index: true },
  purpose: { type: String, enum: ['subscription', 'seat_addition'], default: 'subscription', index: true },
  pendingStaff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

subscriptionPaymentSchema.index({ shop: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export default subscriptionPaymentSchema;
