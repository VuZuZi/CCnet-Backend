import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';

export function registerSystemNotificationListener({
  eventBus,
  notificationBroadcastService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, async (event) => {
    try {
      const basePayload = {
        title: event.title,
        message: event.message,
        actionUrl: event.actionUrl || null,
        entityId: event.entityId,
        severity: event.severity,
      };

      if (event.userIds?.length) {
        await notificationBroadcastService.sendToUsers({
          userIds: event.userIds,
          actorId: event.actorId || null,
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          payload: basePayload,
        });
        return;
      }

      if (event.role) {
        await notificationBroadcastService.sendToRole({
          role: event.role,
          actorId: event.actorId || null,
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          payload: basePayload,
        });
        return;
      }

      await notificationBroadcastService.sendToAll({
        actorId: event.actorId || null,
        type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
        payload: basePayload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle system notification event', {
        error,
        event,
      });
    }
  });
}