import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';

function ensureText(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
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
        actionUrl: ensureText(input.actionUrl, '/notifications'),
        entityType: 'system',
        entityId: input.entityId || null,
        metadata: {
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

      case NOTIFICATION_TYPES.TRANSACTION_REFUNDED:
      const refundReason = input.isAutoRefund ? 'từ dự án đã hủy' : 'theo yêu cầu của bạn';
      return {
        title: 'Hoàn tiền thành công',
        message: `Số tiền ${input.amount ? input.amount.toLocaleString('vi-VN') : ''} VNĐ đã được hoàn vào ví nội bộ ${refundReason}.`,
        actionUrl: ensureText(input.actionUrl, '/wallet'),
        entityType: 'transaction',
        entityId: input.entityId || null,
        metadata: { amount: input.amount || 0, isAutoRefund: input.isAutoRefund },
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

    default:
      throw new Error(`Unsupported notification type: ${type}`);
  }
}