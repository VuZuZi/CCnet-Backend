import { NotificationSettingModel } from '../models/notificationSetting.model.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../constants/notification.constants.js';

export class NotificationSettingRepository {
  async getOrCreate(userId) {
    return NotificationSettingModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { ...DEFAULT_NOTIFICATION_SETTINGS } },
      { upsert: true, new: true }
    ).lean();
  }

  async update(userId, updates) {
    return NotificationSettingModel.findOneAndUpdate(
      { userId },
      {
        $set: updates,
        $setOnInsert: { ...DEFAULT_NOTIFICATION_SETTINGS },
      },
      { upsert: true, new: true }
    ).lean();
  }
}