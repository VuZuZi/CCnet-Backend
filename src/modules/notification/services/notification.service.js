import { NOTIFICATION_SSE_EVENTS } from '../constants/notification.constants.js';

export default class NotificationService {
  constructor({
    notificationRepository,
    notificationSettingService,
    notificationSSEService = null,
    notificationRealtimeGateway = null,
    logger = console,
    createError = null,
  }) {
    this.notificationRepository = notificationRepository;
    this.notificationSettingService = notificationSettingService;
    this.notificationSSEService = notificationSSEService;
    this.notificationRealtimeGateway = notificationRealtimeGateway;
    this.logger = logger;
    this.createError = createError;
  }

  serializeNotification(notification) {
    if (!notification) return null;

    return typeof notification.toObject === 'function'
      ? notification.toObject()
      : notification;
  }

  buildNotFoundError(message = 'Notification not found') {
    if (typeof this.createError === 'function') {
      return this.createError(message, 404);
    }

    const error = new Error(message);
    error.status = 404;
    return error;
  }

  async getUnreadCountValue(recipientId) {
    return this.notificationRepository.countUnread(recipientId);
  }

  hasActiveClients(recipientId) {
    if (!this.notificationSSEService || !recipientId) return false;

    try {
      return this.notificationSSEService.hasActiveClients(String(recipientId));
    } catch (error) {
      this.logger?.error?.('[NotificationService] hasActiveClients failed', {
        recipientId,
        error,
      });
      return false;
    }
  }

  canDispatchRealtime(recipientId) {
    return this.hasActiveClients(recipientId);
  }

  async emitToUser(recipientId, event, payload) {
    if (!recipientId || !event) return false;

    const userId = String(recipientId);
    let emitted = false;

    /*
      Quan trọng:
      - Luôn emit trực tiếp vào SSE local trước.
      - Sau đó mới publish qua realtime gateway nếu có.
      - Không return sớm ở gateway, vì nếu Redis/pubsub không loop về đúng process
        thì client đang mở SSE trên process hiện tại sẽ không nhận realtime.
    */
    try {
      if (this.notificationSSEService) {
        this.notificationSSEService.emitToUser(userId, event, payload);
        emitted = true;
      }
    } catch (error) {
      this.logger?.error?.('[NotificationService] local SSE emit failed', {
        recipientId: userId,
        event,
        error,
      });
    }

    try {
      if (this.notificationRealtimeGateway) {
        await this.notificationRealtimeGateway.publishToUser?.({
          userId,
          eventName: event,
          payload,
        });
        emitted = true;
      }
    } catch (error) {
      this.logger?.error?.('[NotificationService] realtime gateway publish failed', {
        recipientId: userId,
        event,
        error,
      });
    }

    return emitted;
  }

  async emitUnreadCount(recipientId, unreadCount = null) {
    if (!recipientId) {
      return typeof unreadCount === 'number' ? unreadCount : 0;
    }

    const resolvedUnreadCount =
      typeof unreadCount === 'number'
        ? unreadCount
        : await this.getUnreadCountValue(recipientId);

    await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.UNREAD_COUNT, {
      unreadCount: resolvedUnreadCount,
    });

    return resolvedUnreadCount;
  }

  async createNotification(payload) {
    const isEnabled = await this.notificationSettingService.isTypeEnabled(
      payload.recipientId,
      payload.type
    );

    if (!isEnabled) {
      return null;
    }

    const created = await this.notificationRepository.create(payload);
    const serialized = this.serializeNotification(created);

    const recipientId =
      serialized?.recipientId?._id ||
      serialized?.recipientId?.id ||
      serialized?.recipientId ||
      payload?.recipientId ||
      null;

    if (recipientId) {
      try {
        const unreadCount = await this.getUnreadCountValue(recipientId);

        await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.CREATED, {
          event: NOTIFICATION_SSE_EVENTS.CREATED,
          notification: serialized,
          unreadCount,
        });

        await this.emitUnreadCount(recipientId, unreadCount);
      } catch (error) {
        this.logger?.error?.(
          '[NotificationService] createNotification realtime emit failed',
          {
            recipientId,
            type: payload?.type,
            error,
          }
        );
      }
    }

    return serialized;
  }

  async listNotifications({ recipientId, page, limit }) {
    return this.notificationRepository.findByRecipient({
      recipientId,
      page,
      limit,
    });
  }

  async getNotificationById({ id, recipientId }) {
    const item = await this.notificationRepository.findByIdForRecipient({
      id,
      recipientId,
    });

    if (!item) {
      throw this.buildNotFoundError('Notification not found');
    }

    return this.serializeNotification(item);
  }

  async getUnreadCount(recipientId) {
    const unreadCount = await this.getUnreadCountValue(recipientId);
    return { unreadCount };
  }

  async markAsRead({ id, recipientId }) {
    const updated = await this.notificationRepository.markAsRead({
      id,
      recipientId,
    });

    const serialized = this.serializeNotification(updated);
    const unreadCount = await this.getUnreadCountValue(recipientId);

    try {
      await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.READ, {
        notificationId: String(id),
        readAt: serialized?.readAt || new Date().toISOString(),
        unreadCount,
      });

      await this.emitUnreadCount(recipientId, unreadCount);
    } catch (error) {
      this.logger?.error?.('[NotificationService] markAsRead realtime emit failed', {
        recipientId,
        id,
        error,
      });
    }

    return {
      item: serialized,
      unreadCount,
    };
  }

  async markAllAsRead(recipientId) {
    const result = await this.notificationRepository.markAllAsRead(recipientId);
    const unreadCount = 0;
    const readAt = new Date().toISOString();

    try {
      await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.READ_ALL, {
        readAt,
        unreadCount,
      });

      await this.emitUnreadCount(recipientId, unreadCount);
    } catch (error) {
      this.logger?.error?.('[NotificationService] markAllAsRead realtime emit failed', {
        recipientId,
        error,
      });
    }

    return result;
  }

  async deleteNotification({ id, recipientId }) {
    const deleted = await this.notificationRepository.deleteById({
      id,
      recipientId,
    });

    const serialized = this.serializeNotification(deleted);
    const unreadCount = await this.getUnreadCountValue(recipientId);

    try {
      await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.DELETED, {
        notificationId: String(id),
        unreadCount,
      });

      await this.emitUnreadCount(recipientId, unreadCount);
    } catch (error) {
      this.logger?.error?.('[NotificationService] deleteNotification realtime emit failed', {
        recipientId,
        id,
        error,
      });
    }

    return {
      item: serialized,
      unreadCount,
    };
  }
}