import { NotificationSettingModel } from '../models/notificationSetting.model.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../constants/notification.constants.js';

function getMissingDefaultFields(document = {}) {
  const missingFields = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_NOTIFICATION_SETTINGS)) {
    if (typeof document[key] === 'undefined') {
      missingFields[key] = defaultValue;
    }
  }

  return missingFields;
}

class NotificationSettingRepository {
  async getOrCreate(userId) {
    let document = await NotificationSettingModel.findOne({ userId });

    if (!document) {
      document = await NotificationSettingModel.create({
        userId,
        ...DEFAULT_NOTIFICATION_SETTINGS,
      });

      return typeof document.toObject === 'function' ? document.toObject() : document;
    }

    const missingFields = getMissingDefaultFields(
      typeof document.toObject === 'function' ? document.toObject() : document
    );

    if (Object.keys(missingFields).length > 0) {
      Object.entries(missingFields).forEach(([key, value]) => {
        document[key] = value;
      });

      await document.save();
    }

    return typeof document.toObject === 'function' ? document.toObject() : document;
  }

  async update(userId, updates) {
    let existing = await NotificationSettingModel.findOne({ userId });

    if (!existing) {
      const created = await NotificationSettingModel.create({
        userId,
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...updates,
      });

      return typeof created.toObject === 'function' ? created.toObject() : created;
    }

    const currentObject =
      typeof existing.toObject === 'function' ? existing.toObject() : existing;

    const missingFields = getMissingDefaultFields(currentObject);

    Object.entries(missingFields).forEach(([key, value]) => {
      existing[key] = value;
    });

    Object.entries(updates || {}).forEach(([key, value]) => {
      existing[key] = value;
    });

    await existing.save();
    return existing.toObject();
  }
}

export { NotificationSettingRepository };
export default NotificationSettingRepository;