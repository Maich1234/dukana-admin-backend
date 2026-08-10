import { getSmartDukaModels } from '../../../models/smartduka/index.js';
import { logAudit } from '../../../services/auditLogService.js';

/** GET /admin/settings/promotions */
export const listPromotions = async (req, res) => {
  const { Promotion } = await getSmartDukaModels();
  const promotions = await Promotion.find().sort({ createdAt: -1 });
  res.json({ success: true, data: promotions });
};

/** POST /admin/settings/promotions */
export const createPromotion = async (req, res) => {
  const { Promotion } = await getSmartDukaModels();
  const promotion = await Promotion.create(req.body);

  logAudit({
    adminId: req.admin._id,
    action: 'admin.promotion.created',
    entityType: 'Promotion',
    entityId: promotion._id,
    details: { code: promotion.code },
    req,
  }).catch(() => {});

  res.status(201).json({ success: true, data: promotion });
};

/** PATCH /admin/settings/promotions/:id — active: false is the soft-delete; there is no hard delete. */
export const updatePromotion = async (req, res) => {
  const { Promotion } = await getSmartDukaModels();
  const promotion = await Promotion.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });

  logAudit({
    adminId: req.admin._id,
    action: 'admin.promotion.updated',
    entityType: 'Promotion',
    entityId: promotion._id,
    details: { fieldsChanged: Object.keys(req.body) },
    req,
  }).catch(() => {});

  res.json({ success: true, data: promotion });
};
