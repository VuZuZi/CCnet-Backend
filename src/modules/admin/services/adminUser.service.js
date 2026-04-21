import AppError from "../../../core/AppError.js";

class AdminUserService {
  constructor({ adminUserRepository, adminActionLogRepository }) {
    this.adminUserRepository = adminUserRepository;
    this.adminActionLogRepository = adminActionLogRepository;
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

    return updatedUser;
  }
}

export default AdminUserService;