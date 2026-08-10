import express from 'express';
import {
  listShops, getShop, getShopUsers, getShopPayments, getShopActivity,
  updateShop, suspendShop, reactivateShop, lookupShopByUser,
} from '../../../controllers/admin/shopsController.js';
import { requirePermission } from '../../../middlewares/adminAuth.js';
import validate from '../../../middlewares/validate.js';
import { updateShopSchema } from '../../../validations/shopValidation.js';
import { suspendReasonSchema } from '../../../validations/common.js';

const router = express.Router();

// Must come before '/:id' — otherwise 'lookup' is parsed as an :id.
router.get('/lookup', requirePermission('shops.view'), lookupShopByUser);

router.get('/', requirePermission('shops.view'), listShops);
router.get('/:id', requirePermission('shops.view'), getShop);
router.get('/:id/users', requirePermission('shops.view'), getShopUsers);
router.get('/:id/payments', requirePermission('shops.view'), getShopPayments);
router.get('/:id/activity', requirePermission('shops.view'), getShopActivity);
router.patch('/:id', requirePermission('shops.edit'), validate(updateShopSchema), updateShop);
router.patch('/:id/suspend', requirePermission('shops.suspend'), validate(suspendReasonSchema), suspendShop);
router.patch('/:id/reactivate', requirePermission('shops.suspend'), reactivateShop);

export default router;
