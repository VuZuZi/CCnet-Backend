import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';
import { PROJECT_STATUS } from '../../project/project.constant.js';

const normalizeId = (value) => String(value?._id || value || '');

const toVietnameseProjectStatus = (status) => {
  const value = String(status || '').toUpperCase();

  const map = {
    DRAFT: 'Bản nháp',
    PENDING: 'Chờ kiểm duyệt',
    PENDING_APPROVAL: 'Chờ kiểm duyệt',
    UNDER_REVIEW: 'Đang kiểm duyệt',
    REVISION_REQUESTED: 'Cần chỉnh sửa',
    REJECTED: 'Đã bị từ chối',
    APPROVED: 'Đã phê duyệt',
    ACTIVE: 'Đang hoạt động',
    FUNDING: 'Đang gây quỹ',
    RECRUITING: 'Đang tuyển tình nguyện viên',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã hoàn thành',
  };

  return map[value] || value || 'Không xác định';
};

const getRecipientIds = (event) => {
  const ids = [];

  if (Array.isArray(event.recipientIds)) {
    ids.push(...event.recipientIds);
  }

  if (event.recipientId) {
    ids.push(event.recipientId);
  }

  if (event.organizerId) {
    ids.push(event.organizerId);
  }

  return [...new Set(ids.map(normalizeId).filter(Boolean))];
};

const getProjectDecisionType = (event) => {
  const decision = String(event.decision || '').toUpperCase();
  const status = String(event.status || '').toUpperCase();

  if (decision === 'APPROVED') return NOTIFICATION_TYPES.PROJECT_APPROVED;
  if (decision === 'REJECTED') return NOTIFICATION_TYPES.PROJECT_REJECTED;
  if (decision === 'REVISION_REQUESTED') {
    return NOTIFICATION_TYPES.PROJECT_REVISION_REQUESTED;
  }

  if (
    status === PROJECT_STATUS.REJECTED ||
    status === 'REJECTED' ||
    status === PROJECT_STATUS.CANCELLED ||
    status === 'CANCELLED'
  ) {
    return NOTIFICATION_TYPES.PROJECT_REJECTED;
  }

  if (
    status === PROJECT_STATUS.REVISION_REQUESTED ||
    status === 'REVISION_REQUESTED'
  ) {
    return NOTIFICATION_TYPES.PROJECT_REVISION_REQUESTED;
  }

  if (
    status === PROJECT_STATUS.ACTIVE ||
    status === 'ACTIVE' ||
    status === PROJECT_STATUS.FUNDING ||
    status === 'FUNDING' ||
    status === PROJECT_STATUS.RECRUITING ||
    status === 'RECRUITING' ||
    status === 'APPROVED'
  ) {
    return NOTIFICATION_TYPES.PROJECT_APPROVED;
  }

  return NOTIFICATION_TYPES.PROJECT_UPDATED;
};

const buildVietnameseDecisionCopy = (event, type) => {
  const projectName = event.projectName || event.projectTitle || 'dự án của bạn';
  const statusLabel = toVietnameseProjectStatus(event.status);
  const feedback = event.feedback || event.reason || event.reviewNote || '';

  if (type === NOTIFICATION_TYPES.PROJECT_APPROVED) {
    return {
      title: 'Dự án đã được phê duyệt',
      message: `Dự án "${projectName}" đã được phê duyệt và hiện có trạng thái ${statusLabel}.`,
      feedback,
    };
  }

  if (type === NOTIFICATION_TYPES.PROJECT_REJECTED) {
    return {
      title: 'Dự án đã bị từ chối',
      message: `Dự án "${projectName}" đã bị từ chối sau quá trình kiểm duyệt.`,
      feedback,
    };
  }

  if (type === NOTIFICATION_TYPES.PROJECT_REVISION_REQUESTED) {
    return {
      title: 'Dự án cần chỉnh sửa',
      message: `Dự án "${projectName}" cần được chỉnh sửa trước khi có thể phê duyệt.`,
      feedback,
    };
  }

  return {
    title: event.title || 'Dự án đã được cập nhật',
    message:
      event.message ||
      `Dự án "${projectName}" đã được cập nhật trạng thái thành ${statusLabel}.`,
    feedback,
  };
};

async function handleProjectEvent({
  event,
  notificationService,
  mailProvider,
  userRepository,
}) {
  const recipientIds = getRecipientIds(event);
  if (!recipientIds.length) return;

  const notificationType = getProjectDecisionType(event);
  const copy = buildVietnameseDecisionCopy(event, notificationType);

  const payload = buildNotificationPayload({
    type: notificationType,
    title: copy.title,
    projectName: event.projectName,
    message: copy.message,
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
        type: notificationType,
        ...payload,
        title: copy.title,
        message: copy.message,
        actionUrl: event.actionUrl || `/projects/${event.projectId}`,
        entityType: 'project',
        entityId: event.projectId,
        metadata: {
          ...(payload.metadata || {}),
          ...(event.metadata || {}),
          projectId: event.projectId,
          projectName: event.projectName,
          status: event.status,
          statusLabel: toVietnameseProjectStatus(event.status),
          decision: event.decision || null,
          reason: event.reason || '',
          feedback: copy.feedback || '',
          reviewRecordId: event.reviewRecordId || null,
        },
      })
    )
  );

  if (event.status && mailProvider && userRepository) {
    try {
      for (const recipientId of recipientIds) {
        const user = await userRepository.findById(recipientId);
        if (!user?.email) continue;

        let emailType = 'PROJECT_STATUS_UPDATE';
        const emailData = {
          organizerName: user.fullName || user.username || 'bạn',
          projectTitle: event.projectName,
          status: toVietnameseProjectStatus(event.status),
          reason: event.reason || copy.feedback || '',
          projectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${event.projectId}`,
        };

        if (notificationType === NOTIFICATION_TYPES.PROJECT_APPROVED) {
          emailType = 'PROJECT_APPROVED';
        } else if (notificationType === NOTIFICATION_TYPES.PROJECT_REJECTED) {
          emailType = 'PROJECT_REJECTED';
        }

        const subjectMap = {
          PROJECT_APPROVED: 'Dự án của bạn đã được phê duyệt',
          PROJECT_REJECTED: 'Dự án của bạn đã bị từ chối',
          PROJECT_STATUS_UPDATE: 'Trạng thái dự án đã được cập nhật',
        };

        await mailProvider.sendEmail(
          user.email,
          subjectMap[emailType] || 'Trạng thái dự án đã được cập nhật',
          emailType,
          emailData
        );
      }
    } catch (error) {
      console.error('Error sending project status emails:', error);
    }
  }
}

export function registerProjectNotificationListener({
  eventBus,
  notificationService,
  mailProvider = null,
  userRepository = null,
  logger,
}) {
  const listen = async (event) => {
    try {
      await handleProjectEvent({
        event,
        notificationService,
        mailProvider,
        userRepository,
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
  eventBus.on(DOMAIN_EVENTS.PROJECT_REVIEW_DECIDED, listen);
}