import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

export function registerOrganizerRequestSubmittedNotificationListener({
  eventBus,
  notificationBroadcastService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.ORGANIZER_REQUEST_SUBMITTED, async (event) => {
    try {
      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.ORGANIZER_REQUEST_SUBMITTED,
        applicantName: event.applicantName,
        applicantEmail: event.applicantEmail,
        organizationName: event.organizationName,
        message: event.message,
        actionUrl: event.actionUrl,
        entityId: event.requestId,
        status: event.status,
      });

      await notificationBroadcastService.sendToRole({
        role: 'admin',
        actorId: event.actorId || null,
        type: NOTIFICATION_TYPES.ORGANIZER_REQUEST_SUBMITTED,
        payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle organizer request submitted notification event', {
        error,
        event,
      });
    }
  });
}