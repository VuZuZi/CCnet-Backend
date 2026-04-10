import { DOMAIN_EVENTS } from '../constants/notification.events.js';
import { NOTIFICATION_TYPES, NOTIFICATION_SSE_EVENTS } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

export function registerTransactionNotificationListener({
    eventBus,
    notificationService,
    mailProvider = null,
    userRepository = null,
    logger,
}) {
    eventBus.on(DOMAIN_EVENTS.DONATION_SUCCESSFUL, async (payload) => {
        try {
            const {
                donorId, transactionId, projectId, projectName,
                organizerId, donorName, amount, currentEscrowBalance
            } = payload;

            if (donorId) {
                await notificationService.emitToUser(
                    String(donorId),
                    NOTIFICATION_SSE_EVENTS.CREATED, 
                    {
                        notification: {
                            type: NOTIFICATION_TYPES.DONATION_SUCCESSFUL,
                            entityId: projectId,
                            metadata: {
                                transactionId,
                                projectId,
                                amount,
                                currentEscrowBalance
                            }
                        }
                    }
                ).catch(err => logger?.error?.('Lỗi gửi SSE cho Donor:', err.message));
            }

            if (organizerId) {
                const notifPayload = buildNotificationPayload({
                    type: NOTIFICATION_TYPES.DONATION_SUCCESSFUL,
                    entityId: projectId,
                    donorName: donorName,
                    projectName: projectName,
                    amount: amount,
                    transactionId: transactionId
                });

                await notificationService.createNotification({
                    recipientId: String(organizerId),
                    type: NOTIFICATION_TYPES.DONATION_SUCCESSFUL,
                    actorId: donorId || null,
                    ...notifPayload
                }).catch(err => logger?.error?.('Lỗi tạo DB Notif cho Organizer:', err.message));

                if (mailProvider && userRepository) {
                    const organizer = await userRepository.findById(organizerId);
                    if (organizer && organizer.email) {
                        await mailProvider.sendEmail(
                            organizer.email,
                            '🎉 Nhận được khoản tài trợ mới!',
                            'DONATION_RECEIVED',
                            {
                                organizerName: organizer.fullName || organizer.username || 'Organizer',
                                donorName: donorName,
                                amount: amount.toLocaleString('vi-VN') + ' VNĐ',
                                projectName: projectName,
                                projectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${projectId}`
                            }
                        ).catch(err => logger?.error?.('Lỗi gửi Email:', err.message));
                    }
                }
            }
        } catch (error) {
            logger?.error?.('[Transaction Listener] Lỗi xử lý Event:', error);
        }
    });

    eventBus.on(DOMAIN_EVENTS.TRANSACTION_REFUNDED, async (payload) => {
        try {
            const { userId, transactionId, amount, isAutoRefund } = payload;
            if (!userId) return;

            const notifPayload = buildNotificationPayload({
                type: NOTIFICATION_TYPES.TRANSACTION_REFUNDED,
                entityId: transactionId,
                amount,
                isAutoRefund
            });

            await notificationService.createNotification({
                recipientId: userId,
                type: NOTIFICATION_TYPES.TRANSACTION_REFUNDED,
                ...notifPayload
            });
        } catch (error) {
            logger?.error?.('Lỗi Notif Hoàn tiền:', error.message);
        }
    });

    eventBus.on(DOMAIN_EVENTS.TRANSACTION_WITHDRAWAL_REQUESTED, async (payload) => {
        try {
            const { userId, transactionId, amount } = payload;
            if (!userId) return;

            const notifPayload = buildNotificationPayload({
                type: NOTIFICATION_TYPES.TRANSACTION_WITHDRAWAL_REQUESTED,
                entityId: transactionId,
                amount
            });

            await notificationService.createNotification({
                recipientId: userId,
                type: NOTIFICATION_TYPES.TRANSACTION_WITHDRAWAL_REQUESTED,
                ...notifPayload
            });
        } catch (error) {
            logger?.error?.('Lỗi Notif Rút tiền:', error.message);
        }
    });

    eventBus.on(DOMAIN_EVENTS.TRANSACTION_FAILED, async (payload) => {
        try {
            const { userId, transactionId, amount } = payload;
            if (!userId) return;

            const notifPayload = buildNotificationPayload({
                type: NOTIFICATION_TYPES.TRANSACTION_FAILED,
                entityId: transactionId,
                amount
            });

            await notificationService.createNotification({
                recipientId: userId,
                type: NOTIFICATION_TYPES.TRANSACTION_FAILED,
                ...notifPayload
            });
        } catch (error) {
            logger?.error?.('Lỗi Notif Giao dịch thất bại:', error.message);
        }
    });
}