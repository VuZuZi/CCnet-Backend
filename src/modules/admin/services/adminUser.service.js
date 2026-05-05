import AppError from "../../../core/AppError.js";
import {
  AUTH_REALTIME_CHANNELS,
  AUTH_REALTIME_EVENTS,
  getAuthBannedUserKey,
} from "../../auth/authRealtime.constants.js";

class AdminUserService {
  constructor({
    adminUserRepository,
    adminActionLogRepository,
    redis,
    tokenRepository,
  }) {
    this.adminUserRepository = adminUserRepository;
    this.adminActionLogRepository = adminActionLogRepository;
    this.redis = redis;
    this.tokenRepository = tokenRepository;
  }

  _ensureReason(reason) {
    const normalizedReason = String(reason || "").trim();

    if (!normalizedReason) {
      throw new AppError("Reason is required for this action.", 400);
    }

    return normalizedReason;
  }

  async _logAdminAction({
    actorId,
    actorRole = "admin",
    targetType,
    targetId,
    action,
    reason,
    previousState = null,
    nextState = null,
    metadata = null,
  }) {
    if (!actorId || !targetId) {
      return null;
    }

    return this.adminActionLogRepository.createAdminActionLog({
      actorId,
      actorRole,
      targetType,
      targetId,
      action,
      reason,
      previousState,
      nextState,
      metadata,
    });
  }

  async _syncRealtimeBanState({ userId, status, isActive }) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return;

    const normalizedStatus = String(status || "").trim().toLowerCase();
    const isBlocked =
      normalizedStatus === "banned" || isActive === false;
    const occurredAt = new Date().toISOString();

    if (isBlocked) {
      try {
        await this.tokenRepository?.deleteAllByUserId?.(normalizedUserId);
      } catch (error) {
        console.error(
          "[AdminUserService] Failed to revoke refresh tokens:",
          error?.message || error
        );
      }
    }

    if (!this.redis) return;

    try {
      if (isBlocked) {
        await this.redis.set(getAuthBannedUserKey(normalizedUserId), "1");
      } else {
        await this.redis.del(getAuthBannedUserKey(normalizedUserId));
      }

      await this.redis.publish(AUTH_REALTIME_CHANNELS.USER_STATUS_CHANGED, {
        userId: normalizedUserId,
        status: normalizedStatus || (isBlocked ? "banned" : "active"),
        isActive,
        event: isBlocked
          ? AUTH_REALTIME_EVENTS.USER_BANNED
          : AUTH_REALTIME_EVENTS.USER_STATUS_CHANGED,
        occurredAt,
      });
    } catch (error) {
      console.error(
        "[AdminUserService] Failed to publish user status socket event:",
        error?.message || error
      );
    }
  }

  async getUserDetail(userId) {
    const user = await this.adminUserRepository.findUserById(userId);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    return user;
  }

  async toggleUserBan(userId, reason, actorId = null, actorRole = "admin") {
    const normalizedReason = this._ensureReason(reason);

    const user = await this.adminUserRepository.findUserById(userId);
    if (!user) {
      throw new AppError("User not found.", 404);
    }

    const previousState = {
      status: user.status || null,
      isActive: user.isActive,
      isVerified: user.isVerified,
    };

    const nextStatus = user.isActive ? "banned" : "active";

    const updatedUser = await this.adminUserRepository.updateUser(
      userId,
      { $set: { isActive: !user.isActive, status: nextStatus } },
      { new: true }
    );

    await this._logAdminAction({
      actorId,
      actorRole,
      targetType: "user",
      targetId: updatedUser._id,
      action: nextStatus === "banned" ? "BAN_USER" : "UNBAN_USER",
      reason: normalizedReason,
      previousState,
      nextState: {
        status: updatedUser.status || null,
        isActive: updatedUser.isActive,
        isVerified: updatedUser.isVerified,
      },
      metadata: {
        email: updatedUser.email,
        fullName: updatedUser.fullName,
      },
    });

    await this._syncRealtimeBanState({
      userId: updatedUser._id,
      status: updatedUser.status,
      isActive: updatedUser.isActive,
    });

    return updatedUser;
  }

  async updateUserStatus(
    userId,
    status,
    reason,
    actorId = null,
    actorRole = "admin"
  ) {
    const normalizedReason = this._ensureReason(reason);
    const normalizedStatus = String(status || "").trim().toLowerCase();

    const allowedStatuses = new Set(["active", "inactive", "banned"]);
    if (!allowedStatuses.has(normalizedStatus)) {
      throw new AppError("Invalid user status.", 400);
    }

    const existingUser = await this.adminUserRepository.findUserById(userId);
    if (!existingUser) {
      throw new AppError("User not found.", 404);
    }

    const isActive = normalizedStatus !== "banned";

    const updatedUser = await this.adminUserRepository.updateUser(
      userId,
      { $set: { status: normalizedStatus, isActive } },
      { new: true }
    );

    await this._logAdminAction({
      actorId,
      actorRole,
      targetType: "user",
      targetId: updatedUser._id,
      action: "UPDATE_USER_STATUS",
      reason: normalizedReason,
      previousState: {
        status: existingUser.status || null,
        isActive: existingUser.isActive,
        isVerified: existingUser.isVerified,
      },
      nextState: {
        status: updatedUser.status || null,
        isActive: updatedUser.isActive,
        isVerified: updatedUser.isVerified,
      },
      metadata: {
        email: updatedUser.email,
        fullName: updatedUser.fullName,
      },
    });

    await this._syncRealtimeBanState({
      userId: updatedUser._id,
      status: updatedUser.status,
      isActive: updatedUser.isActive,
    });

    return updatedUser;
  }
}

export default AdminUserService;
