import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/MpesaTransaction.js
// — shop-till sale payments (STK Push at checkout), NOT subscription
// billing. `saleId` drops its original `ref: 'Sale'` — the Sale model isn't
// one of this backend's 10 bound smartduka schemas (this backend has no
// reason to read sales), so the ref would be dangling; populate() is never
// called on it here.
const mpesaTransactionSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  saleId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  checkoutRequestId: { type: String, index: true },
  merchantRequestId: { type: String },
  phoneNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  accountReference: { type: String },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'],
    default: 'pending',
    index: true,
  },
  mpesaReceiptNumber: { type: String },
  transactionDate: { type: Date },
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
}, { timestamps: true });

mpesaTransactionSchema.index({ shop: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export default mpesaTransactionSchema;
