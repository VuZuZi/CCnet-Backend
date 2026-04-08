import { NotificationModel } from './models/notification.model.js';

class NotificationRepository {
    async create(payload) {
        return NotificationModel.create(payload);
    }

    async findByRecipient({ recipientId, page, limit }) {
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            NotificationModel.find({ recipientId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            NotificationModel.countDocuments({ recipientId }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    async countUnread(recipientId) {
        return NotificationModel.countDocuments({ recipientId, isRead: false });
    }

    async markAsRead({ id, recipientId }) {
        return NotificationModel.findOneAndUpdate(
            { _id: id, recipientId, isRead: false },
            { $set: { isRead: true, readAt: new Date() } },
            { new: true }
        ).lean();
    }

    async markAllAsRead(recipientId) {
        const now = new Date();

        const result = await NotificationModel.updateMany(
            { recipientId, isRead: false },
            { $set: { isRead: true, readAt: now } }
        );

        return {
            modifiedCount: result.modifiedCount || 0,
            readAt: now,
        };
    }

    async deleteById({ id, recipientId }) {
        return NotificationModel.findOneAndDelete({ _id: id, recipientId }).lean();
    }
}

export default NotificationRepository;
