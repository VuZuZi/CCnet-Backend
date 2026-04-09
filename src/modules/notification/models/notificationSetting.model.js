import mongoose from 'mongoose';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../constants/notification.constants.js';

const notificationSettingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    systemEnabled: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_SETTINGS.systemEnabled,
    },
    followEnabled: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_SETTINGS.followEnabled,
    },
    projectEnabled: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_SETTINGS.projectEnabled,
    },
    organizerRequestEnabled: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_SETTINGS.organizerRequestEnabled,
    },
    postEnabled: {
      type: Boolean,
      default: DEFAULT_NOTIFICATION_SETTINGS.postEnabled,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const NotificationSettingModel =
  mongoose.models.NotificationSetting ||
  mongoose.model('NotificationSetting', notificationSettingSchema);