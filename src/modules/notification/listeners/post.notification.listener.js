import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

export function registerPostNotificationListener({
  eventBus,
  notificationService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.POST_REACTED, async (event) => {
    try {
      if (!event?.recipientId || !event?.actorId) return;
      if (String(event.recipientId) === String(event.actorId)) return;

      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.POST_REACTED,
        actorName: event.actorName,
        actorAvatar: event.actorAvatar,
        postId: event.postId,
        reactionType: event.reactionType,
        actionUrl: `/community/${event.postId}`,
      });

      await notificationService.createNotification({
        recipientId: event.recipientId,
        actorId: event.actorId,
        type: NOTIFICATION_TYPES.POST_REACTED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle post reacted notification', {
        error,
        event,
      });
    }
  });

  eventBus.on(DOMAIN_EVENTS.POST_COMMENTED, async (event) => {
    try {
      if (!event?.recipientId || !event?.actorId) return;
      if (String(event.recipientId) === String(event.actorId)) return;

      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.POST_COMMENTED,
        actorName: event.actorName,
        actorAvatar: event.actorAvatar,
        postId: event.postId,
        commentId: event.commentId,
        previewContent: event.previewContent,
        actionUrl: `/community/${event.postId}?commentId=${event.commentId}`,
      });

      await notificationService.createNotification({
        recipientId: event.recipientId,
        actorId: event.actorId,
        type: NOTIFICATION_TYPES.POST_COMMENTED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle post commented notification', {
        error,
        event,
      });
    }
  });
}