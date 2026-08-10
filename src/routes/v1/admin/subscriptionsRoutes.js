import express from 'express';
import { listSubscriptions, getSubscription, grantGraceExtension, reconcileShopPayment } from '../../../controllers/admin/subscriptionsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { grantGraceExtensionSchema } from '../../../validations/shopValidation.js';

const router = express.Router();

router.get('/', requirePermission('subscriptions.view'), listSubscriptions);
router.get('/:id', requirePermission('subscriptions.view'), getSubscription);
router.patch('/:id/grace-extension', requirePermission('subscriptions.manage'), validate(grantGraceExtensionSchema), grantGraceExtension);
router.post('/:id/payments/:paymentId/reconcile', requirePermission('subscriptions.manage'), reconcileShopPayment);

export default router;
