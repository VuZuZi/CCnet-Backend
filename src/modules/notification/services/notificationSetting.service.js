import { NOTIFICATION_TYPES } from '../constants/notification.constants.js';

function createTypeToSettingKey() {
  const map = {};

  const add = (type, settingKey) => {
    if (type) {
      map[type] = settingKey;
    }
  };

  add(NOTIFICATION_TYPES.FOLLOW_CREATED, 'followEnabled');

  add(NOTIFICATION_TYPES.PROJECT_UPDATED, 'projectEnabled');

  add(NOTIFICATION_TYPES.VOLUNTEER_APPLIED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_APPLICATION_APPROVED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_APPLICATION_REJECTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REQUESTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_APPROVED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REJECTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_REVIEW_REQUIRED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_REVIEW_SUBMITTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.VOLUNTEER_REVIEW_AUTO_MAXED, 'projectEnabled');

  add(NOTIFICATION_TYPES.ORGANIZER_REQUEST_SUBMITTED, 'organizerRequestEnabled');
  add(NOTIFICATION_TYPES.ORGANIZER_REQUEST_UPDATED, 'organizerRequestEnabled');

  add(NOTIFICATION_TYPES.HELP_REQUEST_ASSIGNED, 'helpRequestEnabled');
  add(NOTIFICATION_TYPES.HELP_REQUEST_REASSIGNED, 'helpRequestEnabled');
  add(NOTIFICATION_TYPES.HELP_REQUEST_VERIFIED, 'helpRequestEnabled');
  add(NOTIFICATION_TYPES.HELP_REQUEST_REJECTED, 'helpRequestEnabled');
  add(NOTIFICATION_TYPES.HELP_REQUEST_COMPLETED, 'helpRequestEnabled');
  add(NOTIFICATION_TYPES.HELP_REQUEST_ASSIGNMENT_RESPONDED, 'helpRequestEnabled');

  add(NOTIFICATION_TYPES.DONATION_SUCCESSFUL, 'projectEnabled');
  add(NOTIFICATION_TYPES.REFUND_REQUEST_SUBMITTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.TRANSACTION_REFUNDED, 'projectEnabled');
  add(NOTIFICATION_TYPES.REFUND_REQUEST_REJECTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.TRANSACTION_WITHDRAWAL_REQUESTED, 'projectEnabled');
  add(NOTIFICATION_TYPES.TRANSACTION_FAILED, 'projectEnabled');

  add(NOTIFICATION_TYPES.POST_REACTED, 'postEnabled');
  add(NOTIFICATION_TYPES.POST_COMMENTED, 'postEnabled');
  add(NOTIFICATION_TYPES.COMMENT_REPLIED, 'postEnabled');
  add(NOTIFICATION_TYPES.COMMENT_REACTED, 'postEnabled');
  add(NOTIFICATION_TYPES.MESSAGE_REACTED, 'postEnabled');

  add(NOTIFICATION_TYPES.KYC_EXPIRING_WARNING, 'systemEnabled');
  add(NOTIFICATION_TYPES.KYC_EXPIRED, 'systemEnabled');
  add(NOTIFICATION_TYPES.KYC_GRACE_PERIOD_ENDED, 'systemEnabled');

  add(NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT, 'systemEnabled');

  return Object.freeze(map);
}

const TYPE_TO_SETTING_KEY = createTypeToSettingKey();

const ALLOWED_SETTING_KEYS = new Set([
  'systemEnabled',
  'followEnabled',
  'projectEnabled',
  'organizerRequestEnabled',
  'helpRequestEnabled',
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

    if (!settings) {
      return true;
    }

    if (settings[settingKey] === undefined || settings[settingKey] === null) {
      return true;
    }

    return Boolean(settings[settingKey]);
  }
}

export default NotificationSettingService;
