import Joi from 'joi';
import { objectId } from './objectId.js';

export const createSupportTicketSchema = Joi.object({
  subject: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
  shopId: objectId().allow(null).default(null),
  reporterName: Joi.string().trim().allow('').default(''),
  reporterPhone: Joi.string().trim().allow('').default(''),
  reporterEmail: Joi.string().email().lowercase().trim().allow('').default(''),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
}).unknown(false);

export const updateSupportTicketSchema = Joi.object({
  subject: Joi.string().trim(),
  description: Joi.string().trim(),
  shopId: objectId().allow(null),
  reporterName: Joi.string().trim().allow(''),
  reporterPhone: Joi.string().trim().allow(''),
  reporterEmail: Joi.string().email().lowercase().trim().allow(''),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent'),
}).unknown(false).min(1);

export const assignSupportTicketSchema = Joi.object({
  assignedTo: objectId().allow(null).required(),
}).unknown(false);

export const updateSupportTicketStatusSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').required(),
}).unknown(false);

export const addSupportTicketNoteSchema = Joi.object({
  body: Joi.string().trim().required(),
}).unknown(false);
