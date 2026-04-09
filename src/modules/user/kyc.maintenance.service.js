import { DOMAIN_EVENTS } from '../../config/notification.js';

class KycMaintenanceService {
    constructor({ userRepository, notificationEventBus }) {
        this.userRepository = userRepository;
        this.notificationEventBus = notificationEventBus;
    }

    async processDailyKycChecks() {
        const milestones = [
            { days: 60, type: 'WARNING' },
            { days: 30, type: 'WARNING' },
            { days: 7, type: 'WARNING' },
            { days: 0, type: 'EXPIRE' },
            { days: -30, type: 'CANCEL' }
        ];

        console.log('[KYC Maintenance] Bắt đầu quét quá hạn...');

        const results = await Promise.allSettled(
            milestones.map((m) => this._processMilestone(m.days, m.type))
        );

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[KYC Maintenance] Lỗi quét mốc ${milestones[index].days} ngày:`, result.reason);
            }
        });
    }

    async _processMilestone(days, type) {
        let lastId = null;
        let hasMore = true;
        const batchSize = 100;

        while (hasMore) {
            const users = await this.userRepository.findKycExpiringInDays(days, batchSize, lastId);

            if (!users || users.length === 0) {
                hasMore = false;
                break;
            }

            lastId = users[users.length - 1]._id;
            const userIds = users.map(u => u._id);

            if (type === 'EXPIRE') {
                await this.userRepository.updateKycStatusBatch(userIds, 'EXPIRED');
            }

            this._emitEventsForBatch(users, days, type);
        }
    }

    _emitEventsForBatch(users, days, type) {
        if (!this.notificationEventBus) return;

        users.forEach((user) => {
            let eventName, message;

            if (type === 'WARNING') {
                eventName = DOMAIN_EVENTS.KYC_EXPIRING_WARNING;
                message = `KYC của bạn sẽ hết hạn sau ${days} ngày. Việc tạo dự án hoặc giải ngân có thể bị chặn.`;
            } else if (type === 'EXPIRE') {
                eventName = DOMAIN_EVENTS.KYC_EXPIRED;
                message = 'KYC của bạn đã HẾT HẠN. Mọi hoạt động giải ngân đã bị đóng băng.';
            } else if (type === 'CANCEL') {
                eventName = DOMAIN_EVENTS.KYC_GRACE_PERIOD_ENDED;
                message = 'KYC của bạn đã quá hạn 30 ngày. Hệ thống bắt đầu quá trình hủy các dự án đang chạy.';
            }

            this.notificationEventBus.emit(eventName, {
                userId: user._id,
                email: user.email,
                fullName: user.fullName,
                daysRemaining: days,
                message
            }).catch(err => console.error(`[EventBus] Lỗi emit cho user ${user._id}:`, err.message));
        });
    }
}

export default KycMaintenanceService;