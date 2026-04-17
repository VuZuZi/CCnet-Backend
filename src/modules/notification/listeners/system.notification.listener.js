import { DOMAIN_EVENTS } from "../constants/notification.events.js";
import { NOTIFICATION_TYPES } from "../constants/notification.constants.js";

function normalizeStringArray(values) {
  return [
    ...new Set(
      (values || []).map((item) => String(item || "").trim()).filter(Boolean)
    ),
  ];
}

export function registerSystemNotificationListener({
  eventBus,
  notificationBroadcastService,
  logger,
}) {
  eventBus.on(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, async (event) => {
    try {
      const payload = {
        title: event.title,
        message: event.message,
        actionUrl: event.actionUrl || null,
        entityId: event.entityId || null,
        severity: event.severity,
      };

      const actorId = event.actorId || null;

      if (Array.isArray(event.roleSelections) && event.roleSelections.length) {
        return notificationBroadcastService.sendToRoleSelections({
          roleSelections: event.roleSelections,
          actorId,
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          payload,
        });
      }

      const userIds = normalizeStringArray(event.userIds);
      if (userIds.length) {
        return notificationBroadcastService.sendToUsers({
          userIds,
          actorId,
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          payload,
        });
      }

      return notificationBroadcastService.sendToAll({
        actorId,
        type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
        payload,
      });
    } catch (error) {
      logger?.error?.("Failed to handle system notification event", {
        error,
        event,
      });

      return {
        createdNotifications: [],
        recipientIds: [],
        recipientCount: 0,
        recipients: [],
        requestedUsers: [],
        resolutionBreakdown: [],
      };
    }
  });
}