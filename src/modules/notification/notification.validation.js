import Joi from 'joi';
import { NOTIFICATION_DEFAULTS } from './constants/notification.constants.js';

export const listNotificationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(NOTIFICATION_DEFAULTS.PAGE),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(NOTIFICATION_DEFAULTS.MAX_LIMIT)
    .default(NOTIFICATION_DEFAULTS.LIMIT),
});

export const notificationIdSchema = Joi.object({
  id: Joi.string().trim().required(),
});

export const updateNotificationSettingsSchema = Joi.object({
  systemEnabled: Joi.boolean(),
  followEnabled: Joi.boolean(),
  projectEnabled: Joi.boolean(),
  organizerRequestEnabled: Joi.boolean(),
}).min(1);