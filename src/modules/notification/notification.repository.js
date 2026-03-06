import Notification from "./notification.model.js";

class NotificationRepository {
  async create(data) {
    return await Notification.create(data);
  }

  async createMany(docs) {
    return await Notification.insertMany(docs);
  }
}
export default NotificationRepository;
