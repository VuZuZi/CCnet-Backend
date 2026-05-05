import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

function buildProfilePostActionUrl({ profileUserId = null, postId, commentId = null }) {
  const safePostId = String(postId || '').trim();

  if (!safePostId) {
    return null;
  }

  const basePath = profileUserId
    ? `/users/${encodeURIComponent(String(profileUserId))}`
    : '/profile';

  const query = [`postId=${encodeURIComponent(safePostId)}`];

  if (commentId) {
    query.push(`commentId=${encodeURIComponent(String(commentId))}`);
  }

  return `${basePath}?${query.join('&')}`;
}

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
        actionUrl:
          event.actionUrl ||
          buildProfilePostActionUrl({ postId: event.postId }),
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
        actionUrl:
          event.actionUrl ||
          buildProfilePostActionUrl({
            postId: event.postId,
            commentId: event.commentId,
          }),
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

  eventBus.on(DOMAIN_EVENTS.COMMENT_REPLIED, async (event) => {
    try {
      if (!event?.recipientId || !event?.actorId) return;
      if (String(event.recipientId) === String(event.actorId)) return;

      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.COMMENT_REPLIED,
        actorName: event.actorName,
        actorAvatar: event.actorAvatar,
        postId: event.postId,
        commentId: event.commentId,
        parentCommentId: event.parentCommentId,
        previewContent: event.previewContent,
        actionUrl:
          event.actionUrl ||
          buildProfilePostActionUrl({
            profileUserId: event.postOwnerId,
            postId: event.postId,
            commentId: event.commentId,
          }) ||
          `/community/${event.postId}?commentId=${event.commentId}`,
      });

      await notificationService.createNotification({
        recipientId: event.recipientId,
        actorId: event.actorId,
        type: NOTIFICATION_TYPES.COMMENT_REPLIED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle comment replied notification', {
        error,
        event,
      });
    }
  });

  eventBus.on(DOMAIN_EVENTS.COMMENT_REACTED, async (event) => {
    try {
      if (!event?.recipientId || !event?.actorId) return;
      if (String(event.recipientId) === String(event.actorId)) return;
      if (event.reactionType && event.reactionType !== 'like') return;

      const payload = buildNotificationPayload({
        type: NOTIFICATION_TYPES.COMMENT_REACTED,
        actorName: event.actorName,
        actorAvatar: event.actorAvatar,
        postId: event.postId,
        commentId: event.commentId,
        reactionType: event.reactionType || 'like',
        actionUrl:
          event.actionUrl ||
          buildProfilePostActionUrl({
            profileUserId: event.postOwnerId,
            postId: event.postId,
            commentId: event.commentId,
          }) ||
          `/community/${event.postId}?commentId=${event.commentId}`,
      });

      await notificationService.createNotification({
        recipientId: event.recipientId,
        actorId: event.actorId,
        type: NOTIFICATION_TYPES.COMMENT_REACTED,
        ...payload,
      });
    } catch (error) {
      logger?.error?.('Failed to handle comment reacted notification', {
        error,
        event,
      });
    }
  });
}
