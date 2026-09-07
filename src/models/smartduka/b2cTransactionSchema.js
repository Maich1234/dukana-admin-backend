import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/B2CTransaction.js —
// read-only here (the backstop reconciliation cron reads it, and writes back
// only `reconciledAt` once it's handled a result the primary push missed).
const b2cTransactionSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true },
  originatorConversationId: { type: String, index: true },
  reference: { type: String, required: true, index: true },
  phoneNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  resultCode: { type: String },
  resultDesc: { type: String },
  mpesaReceiptNumber: { type: String },
  transactionCompletedAt: { type: Date },
  reconciledAt: { type: Date, default: null },
}, { timestamps: true });

export default b2cTransactionSchema;
