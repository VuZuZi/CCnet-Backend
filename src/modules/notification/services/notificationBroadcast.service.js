import { NOTIFICATION_DEFAULTS } from "../constants/notification.constants.js";
import { buildNotificationPayload } from "../builders/notificationPayload.builder.js";

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const safeSize = Math.max(1, Number(size) || 1);
  const chunks = [];

  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }

  return chunks;
}

function normalizeStringArray(values) {
  return [
    ...new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];
}

function excludeActor(userIds, actorId) {
  const normalizedUserIds = normalizeStringArray(userIds);

  if (!actorId) {
    return normalizedUserIds;
  }

  const actorIdStr = String(actorId);
  return normalizedUserIds.filter((id) => String(id) !== actorIdStr);
}

function collectSettledResults(results) {
  const fulfilled = [];
  const rejected = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value) {
        fulfilled.push(result.value);
      }
      continue;
    }

    rejected.push(result.reason);
  }

  return { fulfilled, rejected };
}

function normalizeRecipientSnapshot(users = []) {
  return users
    .map((user) => ({
      _id: String(user?._id || user?.id || "").trim(),
      fullName: String(user?.fullName || "").trim() || "Unknown user",
      email: String(user?.email || "").trim() || "--",
      role: String(user?.role || "").trim().toLowerCase() || "user",
      avatar: user?.avatar || null,
    }))
    .filter((user) => user._id);
}

export class NotificationBroadcastService {
  constructor({
    notificationService,
    resolveAllUserIds = null,
    resolveUserIdsByRole = null,
    resolveUsersByIds = null,
    batchSize = NOTIFICATION_DEFAULTS.BROADCAST_BATCH_SIZE,
    logger = null,
  }) {
    this.notificationService = notificationService;
    this.resolveAllUserIds = resolveAllUserIds;
    this.resolveUserIdsByRole = resolveUserIdsByRole;
    this.resolveUsersByIds = resolveUsersByIds;
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

  async resolveRecipientSnapshots(recipientIds = []) {
    const normalizedRecipientIds = normalizeStringArray(recipientIds);

    if (!normalizedRecipientIds.length) {
      return [];
    }

    if (typeof this.resolveUsersByIds !== "function") {
      return [];
    }

    try {
      const users = await this.resolveUsersByIds(normalizedRecipientIds);
      return normalizeRecipientSnapshot(users);
    } catch (error) {
      this.logger?.error?.("Failed to resolve recipient snapshots", {
        recipientIds: normalizedRecipientIds,
        error,
      });
      return [];
    }
  }

  async sendToUsers({
    userIds,
    actorId = null,
    type,
    payload,
    excludeActorFromRecipients = true,
  }) {
    const recipientIds = excludeActorFromRecipients
      ? excludeActor(userIds, actorId)
      : normalizeStringArray(userIds);

    if (!recipientIds.length) {
      return {
        createdNotifications: [],
        recipientIds: [],
        recipientCount: 0,
        recipients: [],
      };
    }

    const builtPayload = buildNotificationPayload({
      ...payload,
      type,
    });

    const batches = chunkArray(recipientIds, this.batchSize);
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
        this.logger?.error?.("Some notification broadcasts failed", {
          type,
          actorId,
          batchSize: batch.length,
          rejectedCount: rejected.length,
          errors: rejected,
        });
      }
    }

    const recipients = await this.resolveRecipientSnapshots(recipientIds);

    return {
      createdNotifications,
      recipientIds,
      recipientCount: recipientIds.length,
      recipients,
    };
  }

  async sendToAll({
    actorId = null,
    type,
    payload,
    excludeActorFromRecipients = true,
  }) {
    if (typeof this.resolveAllUserIds !== "function") {
      throw new Error("resolveAllUserIds() is required for sendToAll");
    }

    const userIds = await this.resolveAllUserIds();

    return this.sendToUsers({
      userIds,
      actorId,
      type,
      payload,
      excludeActorFromRecipients,
    });
  }

  async resolveUsersInRoleByIds(role, userIds = []) {
    const snapshots = await this.resolveRecipientSnapshots(userIds);
    const normalizedRole = String(role || "").trim().toLowerCase();

    return snapshots.filter(
      (user) => String(user.role || "").toLowerCase() === normalizedRole
    );
  }

  async sendToRoleSelections({
    roleSelections = [],
    actorId = null,
    type,
    payload,
    excludeActorFromRecipients = true,
  }) {
    const normalizedSelections = (roleSelections || [])
      .map((selection) => ({
        role: String(selection?.role || "").trim().toLowerCase(),
        userIds: normalizeStringArray(selection?.userIds || []),
      }))
      .filter((selection) => selection.role);

    const requestedUsers = [];
    const finalRecipientIds = [];
    const resolutionBreakdown = [];

    for (const selection of normalizedSelections) {
      const { role, userIds } = selection;

      if (userIds.length > 0) {
        const selectedUsersInRole = await this.resolveUsersInRoleByIds(
          role,
          userIds
        );

        requestedUsers.push(...selectedUsersInRole);
        finalRecipientIds.push(...selectedUsersInRole.map((user) => user._id));

        resolutionBreakdown.push({
          role,
          mode: "selected_users",
          requestedUserIds: userIds,
          requestedUserCount: selectedUsersInRole.length,
          resolvedRecipientCount: selectedUsersInRole.length,
        });

        continue;
      }

      if (typeof this.resolveUserIdsByRole !== "function") {
        throw new Error("resolveUserIdsByRole(role) is required for role resolution");
      }

      const roleUserIds = await this.resolveUserIdsByRole(role);
      finalRecipientIds.push(...normalizeStringArray(roleUserIds));

      resolutionBreakdown.push({
        role,
        mode: "all_in_role",
        requestedUserIds: [],
        requestedUserCount: 0,
        resolvedRecipientCount: normalizeStringArray(roleUserIds).length,
      });
    }

    const broadcastResult = await this.sendToUsers({
      userIds: normalizeStringArray(finalRecipientIds),
      actorId,
      type,
      payload,
      excludeActorFromRecipients,
    });

    return {
      ...broadcastResult,
      requestedUsers: normalizeRecipientSnapshot(requestedUsers),
      resolutionBreakdown,
    };
  }
}