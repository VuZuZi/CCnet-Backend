import AppError from "../../../core/AppError.js";
import { DOMAIN_EVENTS } from "../../../config/notification.js";

function extractBroadcastResult(results = []) {
  for (const result of results) {
    if (result?.status === "fulfilled" && result.value) {
      return result.value;
    }
  }

  return {
    createdNotifications: [],
    recipientIds: [],
    recipientCount: 0,
    recipients: [],
    requestedUsers: [],
    resolutionBreakdown: [],
  };
}

class AdminNotificationService {
  constructor({ eventBus, adminActionLogRepository }) {
    this.eventBus = eventBus;
    this.adminActionLogRepository = adminActionLogRepository;
  }

  async createSystemNotification({
    title,
    message,
    targetType = "all",
    severity = "info",
    actorId = null,
    actorRole = null,
    roleSelections = [],
  }) {
    if (String(actorRole || "").toLowerCase() !== "admin") {
      throw new AppError("Only admin can create system notifications.", 403);
    }

    const normalizedTitle = String(title || "").trim();
    const normalizedMessage = String(message || "").trim();
    const normalizedSeverity = String(severity || "info").trim().toLowerCase();
    const normalizedTargetType = String(targetType || "all")
      .trim()
      .toLowerCase();

    if (!normalizedTitle) {
      throw new AppError("Title is required.", 400);
    }

    if (!normalizedMessage) {
      throw new AppError("Message is required.", 400);
    }

    if (!["info", "success", "warning", "error"].includes(normalizedSeverity)) {
      throw new AppError("Invalid severity.", 400);
    }

    if (!["all", "custom"].includes(normalizedTargetType)) {
      throw new AppError("Invalid target type.", 400);
    }

    if (!this.eventBus || typeof this.eventBus.emit !== "function") {
      throw new AppError("Notification event bus is not available.", 500);
    }

    const basePayload = {
      title: normalizedTitle,
      message: normalizedMessage,
      severity: normalizedSeverity,
      actorId,
    };

    const logNotificationSend = async (metadata) => {
      if (!this.adminActionLogRepository || !actorId) {
        return null;
      }

      return this.adminActionLogRepository.createAdminActionLog({
        actorId,
        actorRole: String(actorRole || "admin").toLowerCase(),
        targetType: "system_notification",
        targetId: actorId,
        action: "SEND_SYSTEM_NOTIFICATION",
        reason: "",
        previousState: null,
        nextState: null,
        metadata,
      });
    };

    if (normalizedTargetType === "custom") {
      const normalizedRoleSelections = (roleSelections || [])
        .map((selection) => ({
          role: String(selection?.role || "").trim().toLowerCase(),
          userIds: [
            ...new Set(
              (selection?.userIds || [])
                .map((id) => String(id || "").trim())
                .filter(Boolean)
            ),
          ],
        }))
        .filter(
          (selection) =>
            selection.role &&
            ["user", "organizer", "admin"].includes(selection.role)
        );

      if (!normalizedRoleSelections.length) {
        throw new AppError("At least one role selection is required.", 400);
      }

      const emitResults = await this.eventBus.emit(
        DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED,
        {
          ...basePayload,
          roleSelections: normalizedRoleSelections,
        }
      );

      const broadcastResult = extractBroadcastResult(emitResults);

      await logNotificationSend({
        title: normalizedTitle,
        message: normalizedMessage,
        severity: normalizedSeverity,
        targetType: "custom",
        roleSelections: normalizedRoleSelections,
        requestedUsers: broadcastResult.requestedUsers || [],
        resolvedRecipientCount: broadcastResult.recipientCount,
        resolvedRecipientIds: broadcastResult.recipientIds,
        resolvedRecipients: broadcastResult.recipients,
        resolutionBreakdown: broadcastResult.resolutionBreakdown || [],
      });

      return {
        success: true,
        targetType: "custom",
        roleSelections: normalizedRoleSelections,
        totalRoles: normalizedRoleSelections.length,
        totalUsers: (broadcastResult.requestedUsers || []).length,
        requestedUsers: broadcastResult.requestedUsers || [],
        resolvedRecipientCount: broadcastResult.recipientCount,
        resolvedRecipientIds: broadcastResult.recipientIds,
        resolvedRecipients: broadcastResult.recipients,
        resolutionBreakdown: broadcastResult.resolutionBreakdown || [],
        title: normalizedTitle,
        message: normalizedMessage,
      };
    }

    const emitResults = await this.eventBus.emit(
      DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED,
      {
        ...basePayload,
      }
    );

    const broadcastResult = extractBroadcastResult(emitResults);

    await logNotificationSend({
      title: normalizedTitle,
      message: normalizedMessage,
      severity: normalizedSeverity,
      targetType: "all",
      requestedUsers: [],
      resolvedRecipientCount: broadcastResult.recipientCount,
      resolvedRecipientIds: broadcastResult.recipientIds,
      resolvedRecipients: broadcastResult.recipients,
      resolutionBreakdown: [],
    });

    return {
      success: true,
      targetType: "all",
      totalRoles: 0,
      totalUsers: 0,
      requestedUsers: [],
      resolvedRecipientCount: broadcastResult.recipientCount,
      resolvedRecipientIds: broadcastResult.recipientIds,
      resolvedRecipients: broadcastResult.recipients,
      resolutionBreakdown: [],
      title: normalizedTitle,
      message: normalizedMessage,
    };
  }
}

export default AdminNotificationService;