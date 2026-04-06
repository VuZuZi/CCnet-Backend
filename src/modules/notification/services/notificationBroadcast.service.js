import { NOTIFICATION_DEFAULTS } from '../constants/notification.constants.js';
import { buildNotificationPayload } from '../builders/notificationPayload.builder.js';

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeUserIds(userIds) {
  return [...new Set((userIds || []).map(String).filter(Boolean))];
}

function collectSettledResults(results) {
  const fulfilled = [];
  const rejected = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value) {
        fulfilled.push(result.value);
      }
      continue;
    }

    rejected.push(result.reason);
  }

  return {
    fulfilled,
    rejected,
  };
}

export class NotificationBroadcastService {
  constructor({
    notificationService,
    resolveAllUserIds = null,
    resolveUserIdsByRole = null,
    batchSize = NOTIFICATION_DEFAULTS.BROADCAST_BATCH_SIZE,
    logger = null,
  }) {
    this.notificationService = notificationService;
    this.resolveAllUserIds = resolveAllUserIds;
    this.resolveUserIdsByRole = resolveUserIdsByRole;
    this.batchSize = batchSize;
    this.logger = logger;
  }

  async createNotificationsForBatch({ batch, actorId, type, payload }) {
    const results = await Promise.allSettled(
      batch.map((recipientId) =>
        this.notificationService.createNotification({
          recipientId,
          actorId,
          type,
          ...payload,
        })
      )
    );

    return collectSettledResults(results);
  }

  async sendToUsers({ userIds, actorId = null, type, payload }) {
    const recipients = normalizeUserIds(userIds);

    if (!recipients.length) {
      return [];
    }

    const builtPayload = buildNotificationPayload({
      ...payload,
      type,
    });

    const batches = chunkArray(recipients, this.batchSize);
    const createdNotifications = [];

    for (const batch of batches) {
      const { fulfilled, rejected } = await this.createNotificationsForBatch({
        batch,
        actorId,
        type,
        payload: builtPayload,
      });

      createdNotifications.push(...fulfilled);

      if (rejected.length > 0) {
        this.logger?.error?.('Some notification broadcasts failed', {
          type,
          actorId,
          batchSize: batch.length,
          rejectedCount: rejected.length,
          errors: rejected,
        });
      }
    }

    return createdNotifications;
  }

  async sendToAll({ actorId = null, type, payload }) {
    if (typeof this.resolveAllUserIds !== 'function') {
      throw new Error('resolveAllUserIds() is required for sendToAll');
    }

    const userIds = await this.resolveAllUserIds();
    return this.sendToUsers({ userIds, actorId, type, payload });
  }

  async sendToRole({ role, actorId = null, type, payload }) {
    if (typeof this.resolveUserIdsByRole !== 'function') {
      throw new Error('resolveUserIdsByRole(role) is required for sendToRole');
    }

    const userIds = await this.resolveUserIdsByRole(role);
    return this.sendToUsers({ userIds, actorId, type, payload });
  }
}