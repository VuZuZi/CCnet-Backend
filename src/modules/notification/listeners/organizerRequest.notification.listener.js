import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

export function registerOrganizerRequestNotificationListener({
  eventBus,
  notificationService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.ORGANIZER_REQUEST_UPDATED, async (event) => {
    try {
      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.ORGANIZER_REQUEST_UPDATED,
        message: event.message,
        actionUrl: event.actionUrl,
        entityId: event.requestId,
        status: event.status,
        reviewerName: event.reviewerName,
      });

      await notificationService.createNotification({
        recipientId: event.recipientId,
        actorId: event.actorId || null,
        type: NOTIFICATION_TYPES.ORGANIZER_REQUEST_UPDATED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle organizer request notification event', {
        error,
        event,
      });
    }
  });
}