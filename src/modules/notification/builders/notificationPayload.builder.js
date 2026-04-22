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

    case NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REQUESTED:
      return {
        title: ensureText(input.title, 'Yêu cầu xin rút tình nguyện viên'),
        message: ensureText(
          input.message,
          `${ensureText(input.actorName, 'Một tình nguyện viên')} đã gửi yêu cầu xin rút khỏi dự án.`
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          actorName: input.actorName || null,
          volunteerId: input.volunteerId || null,
          applicationId: input.applicationId || null,
          withdrawReason: input.withdrawReason || null,
        },
      };

    case NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_APPROVED:
      return {
        title: ensureText(input.title, 'Yêu cầu xin rút đã được chấp nhận'),
        message: ensureText(
          input.message,
          'Organizer đã chấp nhận yêu cầu xin rút của bạn.'
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          actorName: input.actorName || null,
          applicationId: input.applicationId || null,
        },
      };

    case NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REJECTED:
      return {
        title: ensureText(input.title, 'Yêu cầu xin rút đã bị từ chối'),
        message: ensureText(
          input.message,
          'Organizer đã từ chối yêu cầu xin rút của bạn.'
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          actorName: input.actorName || null,
          applicationId: input.applicationId || null,
          reviewNote: input.reviewNote || null,
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

    // --- Cases from feature/Hieu_Donate ---
    case NOTIFICATION_TYPES.DONATION_SUCCESSFUL:
      return {
        title: 'Nhận được khoản tài trợ mới',
        message: `${ensureText(input.donorName, 'Một nhà hảo tâm')} vừa ủng hộ ${input.amount ? input.amount.toLocaleString('vi-VN') : 'một số tiền'} VNĐ cho dự án "${ensureText(input.projectName, 'của bạn')}".`,
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          donorName: input.donorName || null,
          amount: input.amount || 0,
          projectName: input.projectName || null,
          transactionId: input.transactionId || null,
        },
      };

    case NOTIFICATION_TYPES.REFUND_REQUEST_SUBMITTED:
      return {
        title: 'Đã gửi yêu cầu hoàn tiền',
        message: ensureText(
          input.message,
          'Yêu cầu hoàn tiền đã được ghi nhận và đang chờ admin xem xét.'
        ),
        actionUrl: ensureText(
          input.actionUrl,
          '/profile?view=wallet&tab=donation'
        ),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: {
          amount: input.amount || 0,
          reason: input.reason || null,
        },
      };

    case NOTIFICATION_TYPES.TRANSACTION_REFUNDED: {
      const refundReason = input.isAutoRefund ? 'từ dự án đã hủy' : 'theo yêu cầu của bạn';
      return {
        title: 'Hoàn tiền thành công',
        message: `Số tiền ${input.amount ? input.amount.toLocaleString('vi-VN') : ''} VNĐ đã được hoàn vào ví nội bộ ${refundReason}.`,
        actionUrl: ensureText(input.actionUrl, '/profile?view=wallet&tab=wallet'),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: { amount: input.amount || 0, isAutoRefund: input.isAutoRefund },
      };
    }

    case NOTIFICATION_TYPES.REFUND_REQUEST_REJECTED:
      return {
        title: 'Yêu cầu hoàn tiền bị từ chối',
        message: ensureText(
          input.message,
          'Admin đã từ chối yêu cầu hoàn tiền của bạn.'
        ),
        actionUrl: ensureText(
          input.actionUrl,
          '/profile?view=wallet&tab=donation'
        ),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: {
          amount: input.amount || 0,
          reviewNote: input.reviewNote || null,
        },
      };

    case NOTIFICATION_TYPES.TRANSACTION_WITHDRAWAL_REQUESTED:
      return {
        title: 'Yêu cầu rút tiền đang xử lý',
        message: `Hệ thống đã ghi nhận lệnh rút ${input.amount ? input.amount.toLocaleString('vi-VN') : ''} VNĐ về tài khoản ngân hàng của bạn.`,
        actionUrl: ensureText(input.actionUrl, '/wallet/history'),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: { amount: input.amount || 0 },
      };

    case NOTIFICATION_TYPES.TRANSACTION_FAILED:
      return {
        title: 'Giao dịch thất bại',
        message: 'Giao dịch ủng hộ của bạn không thành công (có thể do lỗi từ phía ngân hàng hoặc bạn đã chủ động hủy).',
        actionUrl: ensureText(input.actionUrl, '/wallet/history'),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: { amount: input.amount || 0 },
      };

    // --- Cases from dev ---
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