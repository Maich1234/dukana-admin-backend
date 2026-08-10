import mongoose from 'mongoose';

// Field-for-field copy of smart-duka-backend/src/models/Shop.js, as a plain
// unbound Schema — bound to the secondary connection by ./index.js. This
// backend never writes most of these fields (see adminShopsController's
// allow-listed PATCH), but the full shape is needed to read shop documents
// faithfully (lean() reads bypass schema defaults if a field is missing here).
//
// METHOD_KEY_PATTERN/DEFAULT_PAYMENT_METHODS are inlined from
// smart-duka-backend/src/constants/salePaymentMethods.js rather than porting
// that whole (much larger, till-specific) constants module — this backend
// never creates a Shop or edits paymentMethods, so only the two values the
// schema itself needs are reproduced here.
const METHOD_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{1,23}$/;
const DEFAULT_PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: 'cash', enabled: true },
  { key: 'mpesa', label: 'M-PESA', icon: 'phone', enabled: true },
];

const shopPaymentMethodSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: METHOD_KEY_PATTERN,
  },
  label: { type: String, required: true, trim: true, maxlength: 24 },
  icon: { type: String, trim: true, default: 'wallet' },
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  taxRate: { type: Number, default: 0 },
  country: { type: String, default: 'KE', trim: true, uppercase: true },
  county: { type: String, default: '', trim: true },
  subCounty: { type: String, default: '', trim: true },
  currency: { type: String, default: 'KES', trim: true, uppercase: true },
  receiptThankYouNote: { type: String, default: '', trim: true, maxlength: 150 },
  logoUrl: { type: String, default: '', trim: true },
  motto: { type: String, default: '', trim: true, maxlength: 200 },
  isActive: { type: Boolean, default: true },
  shiftManagementEnabled: { type: Boolean, default: false },
  showStaffCommission: { type: Boolean, default: false },
  purchasingEnabled: { type: Boolean, default: false },
  purchaseCostAllocationMethod: {
    type: String,
    enum: ['quantity', 'value', 'none'],
    default: 'none',
  },
  aiEnabled: { type: Boolean, default: true },
  barcodeScanningEnabled: { type: Boolean, default: true },
  paymentMethods: {
    type: [shopPaymentMethodSchema],
    default: () => DEFAULT_PAYMENT_METHODS.map((m, i) => ({ ...m, order: i })),
  },
  invoiceSeq: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

export default shopSchema;
