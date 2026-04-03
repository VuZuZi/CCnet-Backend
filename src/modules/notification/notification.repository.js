import Notification from "./notification.model.js";

class NotificationRepository {
  async create(data) {
    return await Notification.create(data);
  }

  async createMany(docs) {
    return await Notification.insertMany(docs);
  }

  async findByRecipientId(recipientId, options = {}) {
    const { limit = 20 } = options;

    return await Notification.find({ recipientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async markAsRead(id, recipientId) {
    return await Notification.findOneAndUpdate(
      { _id: id, recipientId },
      { $set: { isRead: true } },
      { new: true }
    )
      .lean()
      .exec();
  }
}
export default NotificationRepository;
