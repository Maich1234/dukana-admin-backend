import mongoose from 'mongoose';

// V1 tickets are admin/agent-created only — no shop-owner self-serve
// submission form (deferred to V2). `shopId` carries no `ref`: Shop lives in
// the secondary (smart-duka) connection, so any screen that needs the shop's
// name alongside a ticket does a manual second query.
const internalNoteSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  body: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const supportTicketSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  reporterName: { type: String, default: '', trim: true },
  reporterPhone: { type: String, default: '', trim: true },
  reporterEmail: { type: String, default: '', trim: true, lowercase: true },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
    index: true,
  },
  internalNotes: {
    type: [internalNoteSchema],
    default: [],
  },
  resolvedAt: { type: Date, default: null },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: true,
  },
}, {
  timestamps: true,
});

export default mongoose.model('SupportTicket', supportTicketSchema);
