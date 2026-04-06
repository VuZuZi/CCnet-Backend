import { NOTIFICATION_SSE_EVENTS } from '../constants/notification.constants.js';

export class NotificationService {
  constructor({
    notificationRepository,
    notificationSettingService,
    notificationSSEService,
    notificationRealtimeGateway = null,
    logger = null,
  }) {
    this.notificationRepository = notificationRepository;
    this.notificationSettingService = notificationSettingService;
    this.notificationSSEService = notificationSSEService;
    this.notificationRealtimeGateway = notificationRealtimeGateway;
    this.logger = logger;
  }

  serializeNotification(notification) {
    if (!notification) return null;

    return typeof notification.toObject === 'function'
      ? notification.toObject()
      : notification;
  }

  async getUnreadCountValue(recipientId) {
    return this.notificationRepository.countUnread(recipientId);
  }

  hasActiveClients(recipientId) {
    return this.notificationSSEService.hasActiveClients(recipientId);
  }

  canDispatchRealtime(recipientId) {
    return (
      this.hasActiveClients(recipientId) ||
      this.notificationRealtimeGateway?.isReady?.() === true
    );
  }

  async emitToUser(recipientId, eventName, payload) {
    try {
      if (this.notificationRealtimeGateway?.isReady?.()) {
        const published = await this.notificationRealtimeGateway.publishToUser({
          userId: recipientId,
          eventName,
          payload,
        });

        if (published) {
          return true;
        }
      }

      this.notificationSSEService.emitToUser(recipientId, eventName, payload);
      return true;
    } catch (error) {
      this.logger?.error?.('Failed to dispatch realtime notification event', {
        error,
        recipientId,
        eventName,
      });

      this.notificationSSEService.emitToUser(recipientId, eventName, payload);
      return true;
    }
  }

  async emitUnreadCount(recipientId, unreadCount = null) {
    if (!this.canDispatchRealtime(recipientId)) {
      return unreadCount ?? null;
    }

    const nextUnreadCount =
      unreadCount ?? (await this.getUnreadCountValue(recipientId));

    await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.UNREAD_COUNT, {
      unreadCount: nextUnreadCount,
    });

    return nextUnreadCount;
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

    if (this.canDispatchRealtime(payload.recipientId)) {
      await this.emitToUser(payload.recipientId, NOTIFICATION_SSE_EVENTS.CREATED, {
        notification: serialized,
      });

      await this.emitUnreadCount(payload.recipientId);
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

  async getUnreadCount(recipientId) {
    const unreadCount = await this.getUnreadCountValue(recipientId);
    return { unreadCount };
  }

  async markAsRead({ id, recipientId }) {
    const updated = await this.notificationRepository.markAsRead({ id, recipientId });
    const unreadCount = await this.getUnreadCountValue(recipientId);

    if (updated && this.canDispatchRealtime(recipientId)) {
      await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.READ, {
        notificationId: String(id),
        readAt: updated.readAt,
      });

      await this.emitUnreadCount(recipientId, unreadCount);
    }

    return {
      item: updated,
      unreadCount,
    };
  }

  async markAllAsRead(recipientId) {
    const result = await this.notificationRepository.markAllAsRead(recipientId);

    if (result.modifiedCount > 0 && this.canDispatchRealtime(recipientId)) {
      await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.READ_ALL, {
        readAt: result.readAt,
      });

      await this.emitUnreadCount(recipientId, 0);
    }

    return result;
  }

  async deleteNotification({ id, recipientId }) {
    const deleted = await this.notificationRepository.deleteById({ id, recipientId });
    const unreadCount = await this.getUnreadCountValue(recipientId);

    if (deleted && this.canDispatchRealtime(recipientId)) {
      await this.emitToUser(recipientId, NOTIFICATION_SSE_EVENTS.DELETED, {
        notificationId: String(id),
      });

      await this.emitUnreadCount(recipientId, unreadCount);
    }

    return {
      item: deleted,
      unreadCount,
    };
  }
}