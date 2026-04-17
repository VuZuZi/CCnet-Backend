import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';

const TYPE_TO_SETTING_KEY = Object.freeze({
  [NOTIFICATION_TYPES.FOLLOW_CREATED]: 'followEnabled',
  [NOTIFICATION_TYPES.PROJECT_UPDATED]: 'projectEnabled',

  [NOTIFICATION_TYPES.VOLUNTEER_APPLIED]: 'projectEnabled',
  [NOTIFICATION_TYPES.VOLUNTEER_APPLICATION_APPROVED]: 'projectEnabled',
  [NOTIFICATION_TYPES.VOLUNTEER_APPLICATION_REJECTED]: 'projectEnabled',
  [NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REQUESTED]: 'projectEnabled',
  [NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_APPROVED]: 'projectEnabled',
  [NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REJECTED]: 'projectEnabled',

  [NOTIFICATION_TYPES.ORGANIZER_REQUEST_SUBMITTED]: 'organizerRequestEnabled',
  [NOTIFICATION_TYPES.ORGANIZER_REQUEST_UPDATED]: 'organizerRequestEnabled',

  [NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT]: 'systemEnabled',

  [NOTIFICATION_TYPES.POST_REACTED]: 'postEnabled',
  [NOTIFICATION_TYPES.POST_COMMENTED]: 'postEnabled',
});

const ALLOWED_SETTING_KEYS = new Set([
  'systemEnabled',
  'followEnabled',
  'projectEnabled',
  'organizerRequestEnabled',
  'postEnabled',
]);

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function sanitizeSettingsUpdate(updates = {}) {
  return Object.entries(updates).reduce((accumulator, [key, value]) => {
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      return accumulator;
    }

    if (typeof value === 'boolean') {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
}

function createCacheEntry(value, ttlMs) {
  return {
    value,
    expiresAt: Date.now() + ttlMs,
  };
}

export class NotificationSettingService {
  constructor({ notificationSettingRepository }) {
    this.notificationSettingRepository = notificationSettingRepository;

    this.cacheTtlMs = DEFAULT_CACHE_TTL_MS;
    this.cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS;

    this.settingsCache = new Map();
    this.cleanupTimer = null;

    this.ensureCleanupTimer();
  }

  ensureCleanupTimer() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [key, entry] of this.settingsCache.entries()) {
        if (!entry || entry.expiresAt <= now) {
          this.settingsCache.delete(key);
        }
      }

      if (this.settingsCache.size === 0) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, this.cleanupIntervalMs);

    this.cleanupTimer.unref?.();
  }

  getCacheKey(userId) {
    return String(userId);
  }

  getCachedSettings(userId) {
    const key = this.getCacheKey(userId);
    const cached = this.settingsCache.get(key);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.settingsCache.delete(key);
      return null;
    }

    return cached.value;
  }

  setCachedSettings(userId, settings) {
    const key = this.getCacheKey(userId);
    this.settingsCache.set(key, createCacheEntry(settings, this.cacheTtlMs));
    this.ensureCleanupTimer();
    return settings;
  }

  invalidateCachedSettings(userId) {
    this.settingsCache.delete(this.getCacheKey(userId));
  }

  async getFreshSettings(userId) {
    const settings = await this.notificationSettingRepository.getOrCreate(userId);
    return this.setCachedSettings(userId, settings);
  }

  async getSettings(userId) {
    const cached = this.getCachedSettings(userId);

    if (cached) {
      return cached;
    }

    return this.getFreshSettings(userId);
  }

  async updateSettings(userId, updates) {
    const sanitizedUpdates = sanitizeSettingsUpdate(updates);

    if (!Object.keys(sanitizedUpdates).length) {
      return this.getSettings(userId);
    }

    const updated = await this.notificationSettingRepository.update(
      userId,
      sanitizedUpdates
    );

    return this.setCachedSettings(userId, updated);
  }

  async isTypeEnabled(userId, type) {
    const settings = await this.getSettings(userId);
    const settingKey = TYPE_TO_SETTING_KEY[type] || 'systemEnabled';
    return Boolean(settings?.[settingKey]);
  }
}

export default NotificationSettingService;