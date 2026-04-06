import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

async function handleProjectEvent({ event, notificationService }) {
  const recipientIds = [...new Set((event.recipientIds || []).map(String))];
  if (!recipientIds.length) return;

  const payload = buildNotificationPayload({
    type: NOTIFICATION_TYPES.PROJECT_UPDATED,
    title: event.title,
    projectName: event.projectName,
    message: event.message,
    actionUrl: event.actionUrl || `/projects/${event.projectId}`,
    entityId: event.projectId,
    status: event.status,
    actorName: event.actorName,
  });

  await Promise.allSettled(
    recipientIds.map((recipientId) =>
      notificationService.createNotification({
        recipientId,
        actorId: event.actorId || null,
        type: NOTIFICATION_TYPES.PROJECT_UPDATED,
        ...payload,
      })
    )
  );
}

export function registerProjectNotificationListener({
  eventBus,
  notificationService,
  logger,
}) {
  const listen = async (event) => {
    try {
      await handleProjectEvent({
        event,
        notificationService,
      });
    } catch (error) {
      logger?.error?.('Failed to handle project notification event', {
        error,
        event,
      });
    }
  };

  eventBus.on(DOMAIN_EVENTS.PROJECT_UPDATED, listen);
  eventBus.on(DOMAIN_EVENTS.PROJECT_SUBMITTED_FOR_APPROVAL, listen);
  eventBus.on(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, listen);
}