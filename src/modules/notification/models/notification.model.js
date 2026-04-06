import mongoose from 'mongoose';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
} from '../constants/notification.constants.js';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: Object.values(NOTIFICATION_CHANNELS),
      default: NOTIFICATION_CHANNELS.IN_APP,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    actionUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    entityType: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    entityId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);