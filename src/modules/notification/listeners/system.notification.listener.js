import { DOMAIN_EVENTS } from "../constants/notification.events.js";
import { NOTIFICATION_TYPES } from "../constants/notification.constants.js";

function normalizeStringArray(values) {
  return [
    ...new Set(
      (values || []).map((item) => String(item || "").trim()).filter(Boolean)
    ),
  ];
}

function emptyBroadcastResult() {
  return {
    createdNotifications: [],
    recipientIds: [],
    recipientCount: 0,
    recipients: [],
    requestedUsers: [],
    resolutionBreakdown: [],
  };
}

function normalizeRoleSelections(roleSelections = []) {
  return (roleSelections || [])
    .map((selection) => ({
      role: String(selection?.role || "").trim().toLowerCase(),
      userIds: normalizeStringArray(selection?.userIds || []),
    }))
    .filter((selection) => selection.role);
}

function expandRecipientAliases(recipientIds = []) {
  const normalizedRecipientIds = normalizeStringArray(recipientIds);
  const roleSelections = [];
  const directUserIds = [];

  for (const recipientId of normalizedRecipientIds) {
    if (recipientId === "ADMIN_GROUP") {
      roleSelections.push({ role: "admin", userIds: [] });
      continue;
    }

    if (recipientId === "MANAGER_GROUP") {
      roleSelections.push({ role: "manager", userIds: [] });
      continue;
    }

    directUserIds.push(recipientId);
  }

  return { roleSelections, directUserIds };
}

function mergeBroadcastResults(roleResult = null, directResult = null) {
  const createdNotifications = [
    ...(roleResult?.createdNotifications || []),
    ...(directResult?.createdNotifications || []),
  ];
  const recipientIds = normalizeStringArray([
    ...(roleResult?.recipientIds || []),
    ...(directResult?.recipientIds || []),
  ]);

  return {
    createdNotifications,
    recipientIds,
    recipientCount: recipientIds.length,
    recipients: [
      ...(roleResult?.recipients || []),
      ...(directResult?.recipients || []),
    ],
    requestedUsers: roleResult?.requestedUsers || [],
    resolutionBreakdown: roleResult?.resolutionBreakdown || [],
  };
}

export function registerSystemNotificationListener({
  eventBus,
  notificationBroadcastService,
  logger,
}) {
  const handleSystemAnnouncement = async (event) => {
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

      return emptyBroadcastResult();
    }
  };

  const handleTargetedSystemNotification = async (event) => {
    try {
      const payload = {
        title: event.title,
        message: event.message,
        actionUrl: event.actionUrl || null,
        entityId: event.entityId || null,
        severity: event.severity || "info",
      };
      const actorId = event.actorId || null;

      const explicitRoleSelections = normalizeRoleSelections(event.roleSelections);
      const { roleSelections: aliasRoleSelections, directUserIds } = expandRecipientAliases(
        event.recipientIds
      );

      const mergedRoleSelections = normalizeRoleSelections([
        ...explicitRoleSelections,
        ...aliasRoleSelections,
      ]);

      let roleResult = null;
      if (mergedRoleSelections.length) {
        roleResult = await notificationBroadcastService.sendToRoleSelections({
          roleSelections: mergedRoleSelections,
          actorId,
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          payload,
        });
      }

      const roleRecipientIds = new Set(roleResult?.recipientIds || []);
      const targetUserIds = directUserIds.filter((id) => !roleRecipientIds.has(id));

      let directResult = null;
      if (targetUserIds.length) {
        directResult = await notificationBroadcastService.sendToUsers({
          userIds: targetUserIds,
          actorId,
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          payload,
        });
      }

      if (!roleResult && !directResult) {
        return emptyBroadcastResult();
      }

      return mergeBroadcastResults(roleResult, directResult);
    } catch (error) {
      logger?.error?.("Failed to handle targeted system notification event", {
        error,
        event,
      });

      return emptyBroadcastResult();
    }
  };

  eventBus.on(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, handleSystemAnnouncement);
  eventBus.on(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, handleTargetedSystemNotification);
}
