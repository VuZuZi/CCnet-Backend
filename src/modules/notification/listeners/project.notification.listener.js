import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';
import { PROJECT_STATUS } from '../../project/project.constant.js';

async function handleProjectEvent({ event, notificationService, mailProvider, userRepository }) {
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

  // Create in-app notifications
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

  // Send email notifications for status changes
  if (event.status && mailProvider && userRepository) {
    try {
      for (const recipientId of recipientIds) {
        const user = await userRepository.findById(recipientId);
        if (!user?.email) continue;

        let emailType = 'PROJECT_STATUS_UPDATE';
        let emailData = {
          organizerName: user.fullName || user.username || 'User',
          projectTitle: event.projectName,
          status: event.status,
          projectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${event.projectId}`,
        };

        if (event.status === PROJECT_STATUS.ACTIVE) {
          emailType = 'PROJECT_APPROVED';
        } else if (event.status === PROJECT_STATUS.CANCELLED) {
          emailType = 'PROJECT_REJECTED';
        }

        const subjectMap = {
          'PROJECT_APPROVED': '🎉 Your Project Has Been Approved!',
          'PROJECT_REJECTED': 'Project Submission Status Update',
          'PROJECT_STATUS_UPDATE': 'Project Status Updated',
        };

        await mailProvider.sendEmail(
          user.email,
          subjectMap[emailType] || 'Project Status Updated',
          emailType,
          emailData
        );
      }
    } catch (error) {
      console.error('Error sending project status emails:', error);
      // Don't throw - allow the process to continue even if email fails
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
}