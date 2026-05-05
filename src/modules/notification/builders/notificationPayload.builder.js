import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';

function ensureText(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function buildCommentPreview(value, maxLength = 80) {
  const text = ensureText(value, '');

  if (!text) return '';

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength).trim()}...`;
}

export function buildNotificationPayload(input) {
  const { type } = input;

  switch (type) {
    case NOTIFICATION_TYPES.FOLLOW_CREATED:
      return {
        title: 'Có người theo dõi mới',
        message: `${ensureText(input.actorName, 'Một người dùng')} đã bắt đầu theo dõi bạn.`,
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
        title: ensureText(input.title, 'Dự án đã được cập nhật'),
        message: ensureText(
          input.message,
          `Dự án "${ensureText(input.projectName, 'không tên')}" có cập nhật mới.`
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || null,
          actorName: input.actorName || null,
          feedback: input.feedback || input.reason || null,
          reason: input.reason || null,
          decision: input.decision || null,
        },
      };

    case NOTIFICATION_TYPES.PROJECT_APPROVED:
      return {
        title: ensureText(input.title, 'Dự án đã được phê duyệt'),
        message: ensureText(
          input.message,
          `Dự án "${ensureText(input.projectName, 'không tên')}" đã được phê duyệt.`
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || 'APPROVED',
          actorName: input.actorName || null,
          feedback: input.feedback || input.reason || null,
          reason: input.reason || null,
          decision: input.decision || 'APPROVED',
        },
      };

    case NOTIFICATION_TYPES.PROJECT_REJECTED:
      return {
        title: ensureText(input.title, 'Dự án đã bị từ chối'),
        message: ensureText(
          input.message,
          `Dự án "${ensureText(input.projectName, 'không tên')}" đã bị từ chối trong quá trình kiểm duyệt.`
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || 'REJECTED',
          actorName: input.actorName || null,
          feedback: input.feedback || input.reason || null,
          reason: input.reason || null,
          decision: input.decision || 'REJECTED',
        },
      };

    case NOTIFICATION_TYPES.PROJECT_REVISION_REQUESTED:
      return {
        title: ensureText(input.title, 'Dự án cần chỉnh sửa'),
        message: ensureText(
          input.message,
          `Dự án "${ensureText(input.projectName, 'không tên')}" cần cập nhật thêm trước khi được phê duyệt.`
        ),
        actionUrl: ensureText(input.actionUrl, `/projects/${input.entityId || ''}`),
        entityType: 'project',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || 'REVISION_REQUESTED',
          actorName: input.actorName || null,
          feedback: input.feedback || input.reason || null,
          reason: input.reason || null,
          decision: input.decision || 'REVISION_REQUESTED',
        },
      };

    case NOTIFICATION_TYPES.PROJECT_REVIEW_SUBMITTED_TO_ADMINS:
      return {
        title: ensureText(input.title, 'Dự án mới cần kiểm duyệt'),
        message: ensureText(
          input.message,
          `Dự án "${ensureText(input.projectName, 'không tên')}" đã được gửi đến cockpit kiểm duyệt.`
        ),
        actionUrl: ensureText(input.actionUrl, `/admin/projects/${input.entityId || ''}/review`),
        entityType: 'project_review',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || null,
        },
      };

    case NOTIFICATION_TYPES.PROJECT_RESUBMITTED_FOR_APPROVAL:
      return {
        title: ensureText(input.title, 'Dự án đã được gửi lại'),
        message: ensureText(
          input.message,
          `Organizer đã gửi lại dự án "${ensureText(input.projectName, 'không tên')}" sau yêu cầu bổ sung.`
        ),
        actionUrl: ensureText(input.actionUrl, `/admin/projects/${input.entityId || ''}/review`),
        entityType: 'project_review',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          status: input.status || null,
        },
      };

    case NOTIFICATION_TYPES.PROJECT_AI_REVIEW_COMPLETED:
    case NOTIFICATION_TYPES.PROJECT_AI_REVIEW_FAILED:
      return {
        title: ensureText(
          input.title,
          type === NOTIFICATION_TYPES.PROJECT_AI_REVIEW_COMPLETED
            ? 'Báo cáo phân tích sơ bộ đã sẵn sàng'
            : 'Báo cáo phân tích sơ bộ thất bại'
        ),
        message: ensureText(
          input.message,
          type === NOTIFICATION_TYPES.PROJECT_AI_REVIEW_COMPLETED
            ? `Báo cáo AI sơ bộ cho dự án "${ensureText(input.projectName, 'không tên')}" đã hoàn tất.`
            : `Báo cáo AI sơ bộ cho dự án "${ensureText(input.projectName, 'không tên')}" không hoàn tất. Admin vẫn có thể kiểm duyệt thủ công.`
        ),
        actionUrl: ensureText(input.actionUrl, `/admin/projects/${input.entityId || ''}/review`),
        entityType: 'project_ai_review',
        entityId: input.entityId || null,
        metadata: {
          projectName: input.projectName || null,
          runId: input.runId || null,
          errorCode: input.errorCode || null,
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
        title: 'Yêu cầu tổ chức mới',
        message: ensureText(
          input.message,
          `${ensureText(input.applicantName, 'Một người dùng')} đã gửi yêu cầu trở thành tổ chức.`
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
        title: 'Yêu cầu tổ chức đã được cập nhật',
        message: ensureText(
          input.message,
          'Trạng thái yêu cầu tổ chức của bạn đã thay đổi.'
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
        title: ensureText(input.title, 'Thông báo hệ thống'),
        message: ensureText(input.message, 'Bạn có một thông báo hệ thống mới.'),
        actionUrl: input.actionUrl ? String(input.actionUrl).trim() : null,
        entityType: ensureText(input.entityType, 'system'),
        entityId: input.entityId || null,
        metadata: {
          ...(input.metadata || {}),
          severity: input.severity || 'info',
        },
      };

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
        metadata: {
          amount: input.amount || 0,
          isAutoRefund: input.isAutoRefund,
        },
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
        metadata: {
          amount: input.amount || 0,
        },
      };

    case NOTIFICATION_TYPES.TRANSACTION_FAILED:
      return {
        title: 'Giao dịch thất bại',
        message: 'Giao dịch ủng hộ của bạn không thành công. Có thể do lỗi từ phía ngân hàng hoặc bạn đã chủ động hủy.',
        actionUrl: ensureText(input.actionUrl, '/wallet/history'),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: {
          amount: input.amount || 0,
        },
      };

    case NOTIFICATION_TYPES.POST_REACTED:
      return {
        title: 'Bài viết của bạn có tương tác mới',
        message: `${ensureText(input.actorName, 'Một người dùng')} đã thích bài viết của bạn.`,
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
      const actorName = ensureText(input.actorName, 'Một người dùng');
      const previewContent = buildCommentPreview(input.previewContent);

      return {
        title: 'Bài viết của bạn có bình luận mới',
        message: previewContent
          ? `${actorName} đã bình luận về bài viết của bạn: "${previewContent}"`
          : `${actorName} đã bình luận về bài viết của bạn.`,
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

    case NOTIFICATION_TYPES.COMMENT_REPLIED: {
      const actorName = ensureText(input.actorName, 'Một người dùng');
      const previewContent = buildCommentPreview(input.previewContent);

      return {
        title: 'Có phản hồi mới cho bình luận của bạn',
        message: previewContent
          ? `${actorName} đã trả lời bình luận của bạn: "${previewContent}"`
          : `${actorName} đã trả lời bình luận của bạn.`,
        actionUrl: ensureText(
          input.actionUrl,
          `/community/${input.postId || ''}?commentId=${input.commentId || ''}`
        ),
        entityType: 'comment_reply',
        entityId: input.commentId || null,
        metadata: {
          postId: input.postId || null,
          commentId: input.commentId || null,
          parentCommentId: input.parentCommentId || null,
          actorName: input.actorName || null,
          actorAvatar: input.actorAvatar || null,
          previewContent: input.previewContent || null,
        },
      };
    }

    case NOTIFICATION_TYPES.COMMENT_REACTED: {
      const actorName = ensureText(input.actorName, 'Một người dùng');

      return {
        title: 'Bình luận của bạn có tương tác mới',
        message: `${actorName} đã thích bình luận của bạn.`,
        actionUrl: ensureText(
          input.actionUrl,
          `/community/${input.postId || ''}?commentId=${input.commentId || ''}`
        ),
        entityType: 'comment_reaction',
        entityId: input.commentId || null,
        metadata: {
          postId: input.postId || null,
          commentId: input.commentId || null,
          reactionType: input.reactionType || 'like',
          actorName: input.actorName || null,
          actorAvatar: input.actorAvatar || null,
        },
      };
    }

    default:
      throw new Error(`Unsupported notification type: ${type}`);
  }
}
