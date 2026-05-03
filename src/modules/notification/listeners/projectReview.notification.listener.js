import { DOMAIN_EVENTS } from "../constants/notification.events.js";
import { NOTIFICATION_TYPES } from "../constants/notification.constants.js";

const ADMIN_ROLE = "admin";

async function notifyAdmins({
  notificationBroadcastService,
  type,
  event,
  excludeActor = true,
}) {
  if (!notificationBroadcastService) return null;

  return notificationBroadcastService.sendToRole({
    role: ADMIN_ROLE,
    actorId: event.actorId || event.organizerId || null,
    type,
    payload: {
      title: event.title,
      message: event.message,
      actionUrl: event.actionUrl || `/admin/projects/${event.projectId}/review`,
      entityId: event.projectId,
      projectName: event.projectTitle || event.title,
      status: event.status || null,
      runId: event.runId || null,
      errorCode: event.errorCode || null,
    },
    excludeActorFromRecipients: excludeActor,
  });
}

export function registerProjectReviewNotificationListener({
  eventBus,
  notificationBroadcastService,
  logger,
}) {
  // Project submission events: exclude the submitting organizer from admin list (standard behaviour).
  const listen = (type) => async (event) => {
    try {
      await notifyAdmins({
        notificationBroadcastService,
        type,
        event,
        excludeActor: true,
      });
    } catch (error) {
      logger?.error?.("Failed to handle project review notification event", {
        error,
        event,
        type,
      });
    }
  };

  // AI review events are background system events.
  // The admin who triggered retry must receive the SSE — do NOT exclude them.
  const listenAI = (type) => async (event) => {
    try {
      await notifyAdmins({
        notificationBroadcastService,
        type,
        event,
        excludeActor: false,
      });
    } catch (error) {
      logger?.error?.("Failed to handle project AI review notification event", {
        error,
        event,
        type,
      });
    }
  };

  eventBus.on(
    DOMAIN_EVENTS.PROJECT_REVIEW_SUBMITTED_TO_ADMINS,
    listen(NOTIFICATION_TYPES.PROJECT_REVIEW_SUBMITTED_TO_ADMINS)
  );
  eventBus.on(
    DOMAIN_EVENTS.PROJECT_RESUBMITTED_FOR_APPROVAL,
    listen(NOTIFICATION_TYPES.PROJECT_RESUBMITTED_FOR_APPROVAL)
  );
  eventBus.on(
    DOMAIN_EVENTS.PROJECT_AI_REVIEW_COMPLETED,
    listenAI(NOTIFICATION_TYPES.PROJECT_AI_REVIEW_COMPLETED)
  );
  eventBus.on(
    DOMAIN_EVENTS.PROJECT_AI_REVIEW_FAILED,
    listenAI(NOTIFICATION_TYPES.PROJECT_AI_REVIEW_FAILED)
  );
}
