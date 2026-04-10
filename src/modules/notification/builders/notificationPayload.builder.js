import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';

function ensureText(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function buildCommentPreview(value, maxLength = 80) {
  const text = ensureText(value, '');

  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

export function buildNotificationPayload(input) {
  const { type } = input;

  switch (type) {
    case NOTIFICATION_TYPES.FOLLOW_CREATED:
      return {
        title: 'New follower',
        message: `${ensureText(input.actorName, 'Someone')} started following you.`,
        actionUrl: ensureText(input.actionUrl, '/profile/followers'),
        entityType: 'follow',
        entityId: input.entityId || null,
        metadata: {
          actorName: input.actorName || null,
          actorAvatar: input.actorAvatar || null,
        },
      };

    case NOTIFICATION_TYPES.PROJECT_UPDATED:
      return {
        title: ensureText(input.title, 'Project updated'),
        message: ensureText(
          input.message,
          `${ensureText(input.projectName, 'A project')} has a new update.`
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || null,
          actorName: input.actorName || null,
        },
      };

    case NOTIFICATION_TYPES.ORGANIZER_REQUEST_SUBMITTED:
      return {
        title: 'New organizer request',
        message: ensureText(
          input.message,
          `${ensureText(input.applicantName, 'A user')} submitted an organizer request.`
        ),
        actionUrl: ensureText(input.actionUrl, `/admin/organizers/${input.entityId || ''}`),
        entityType: 'organizer_request',
        entityId: input.entityId || null,
        metadata: {
          applicantName: input.applicantName || null,
          applicantEmail: input.applicantEmail || null,
          organizationName: input.organizationName || null,
          status: input.status || null,
        },
      };

    case NOTIFICATION_TYPES.ORGANIZER_REQUEST_UPDATED:
      return {
        title: 'Organizer request updated',
        message: ensureText(
          input.message,
          'Your organizer request status has changed.'
        ),
        actionUrl: ensureText(input.actionUrl, '/organizer/request'),
        entityType: 'organizer_request',
        entityId: input.entityId || null,
        metadata: {
          status: input.status || null,
          reviewerName: input.reviewerName || null,
        },
      };

    case NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT:
      return {
        title: ensureText(input.title, 'System announcement'),
        message: ensureText(input.message, 'You have a new system notification.'),
        actionUrl: input.actionUrl ? String(input.actionUrl).trim() : null,
        entityType: 'system',
        entityId: input.entityId || null,
        metadata: {
          severity: input.severity || 'info',
        },
      };

    case NOTIFICATION_TYPES.POST_REACTED:
      return {
        title: 'New reaction on your post',
        message: `${ensureText(input.actorName, 'Someone')} liked your post.`,
        actionUrl: ensureText(input.actionUrl, `/community/${input.postId || ''}`),
        entityType: 'post',
        entityId: input.postId || null,
        metadata: {
          postId: input.postId || null,
          reactionType: input.reactionType || 'like',
          actorName: input.actorName || null,
          actorAvatar: input.actorAvatar || null,
        },
      };

    case NOTIFICATION_TYPES.POST_COMMENTED: {
      const actorName = ensureText(input.actorName, 'Someone');
      const previewContent = buildCommentPreview(input.previewContent);

      return {
        title: 'New comment on your post',
        message: previewContent
          ? `${actorName} commented on your post: "${previewContent}"`
          : `${actorName} commented on your post.`,
        actionUrl: ensureText(
          input.actionUrl,
          `/community/${input.postId || ''}?commentId=${input.commentId || ''}`
        ),
        entityType: 'post_comment',
        entityId: input.commentId || null,
        metadata: {
          postId: input.postId || null,
          commentId: input.commentId || null,
          actorName: input.actorName || null,
          actorAvatar: input.actorAvatar || null,
          previewContent: input.previewContent || null,
        },
      };
    }

    default:
      throw new Error(`Unsupported notification type: ${type}`);
  }
}