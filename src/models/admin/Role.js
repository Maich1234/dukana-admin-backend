import mongoose from 'mongoose';
import { PERMISSION_VALUES } from '../../constants/permissions.js';

// A named, curated permission subset an AdminUser is assigned via roleId.
// "Mini Admin" / "Section Admin" from the product spec aren't hardcoded
// roles — they're ordinary rows here (e.g. a "Finance Section Admin" role
// with permissions: ['payments.view', 'subscriptions.view', 'commissions.view']),
// built and edited from the Roles UI. Only the seeded `super_admin` row is
// special: isSystemRole locks it from ever being edited or deleted, and
// requireSuperAdmin checks the slug directly rather than consulting
// `permissions` at all (it bypasses every permission check outright).
const roleSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  permissions: {
    type: [String],
    enum: PERMISSION_VALUES,
    default: [],
  },
  // Protects the seeded super_admin role (and any future system role) from
  // edit/delete via the API — see requireSuperAdmin-guarded routes in
  // routes/v1/admin/rolesRoutes.js.
  isSystemRole: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null,
  },
}, {
  timestamps: true,
});

export default mongoose.model('Role', roleSchema);
