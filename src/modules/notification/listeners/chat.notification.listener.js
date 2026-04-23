import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

export function registerChatNotificationListener({
  eventBus,
  notificationService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.MESSAGE_REACTED, async (event) => {
    try {
      if (!event?.recipientId || !event?.actorId) return;
      if (String(event.recipientId) === String(event.actorId)) return;

      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.MESSAGE_REACTED,
        actorName: event.actorName,
        actorAvatar: event.actorAvatar,
        conversationId: event.conversationId,
        messageId: event.messageId,
        emoji: event.emoji,
        actionUrl:
          event.actionUrl ||
          `/chat?conversationId=${event.conversationId || ''}`,
      });

      await notificationService.createNotification({
        recipientId: event.recipientId,
        actorId: event.actorId,
        type: NOTIFICATION_TYPES.MESSAGE_REACTED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle message reacted notification', {
        error,
        event,
      });
    }
  });
}
