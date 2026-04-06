import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

export function registerFollowNotificationListener({
  eventBus,
  notificationService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.FOLLOW_CREATED, async (event) => {
    try {
      const followerUserId = event.actorId ? String(event.actorId) : null;

      const actionUrl = followerUserId
        ? `/following?tab=followers&highlightUser=${encodeURIComponent(followerUserId)}`
        : '/following?tab=followers';

      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.FOLLOW_CREATED,
        actorName: event.actorName,
        actorAvatar: event.actorAvatar,
        actionUrl,
        entityId: event.followId,
      });

      await notificationService.createNotification({
        recipientId: event.targetUserId,
        actorId: event.actorId,
        type: NOTIFICATION_TYPES.FOLLOW_CREATED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle follow notification event', {
        error,
        event,
      });
    }
  });
}