import mongoose from 'mongoose';

// Field-for-field copy of
// smart-duka-backend/src/models/EmployeeReferralPayout.js — the manual cash
// ledger for staff referrals. Created there (subscriptionController.js, on
// the referred shop's first successful payment); read/transitioned here via
// referralPayoutsController.js's list/pay/cancel endpoints.
const employeeReferralPayoutSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  referredShopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, unique: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'KES', uppercase: true, trim: true },
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending',
    index: true,
  },
  // No `ref`: AdminUser is admin-native, not part of this connection.
  paidBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  paidAt: { type: Date, default: null },
  cancelledReason: { type: String, default: '', trim: true },
}, { timestamps: true });

export default employeeReferralPayoutSchema;
