import AppError from "../../core/AppError.js";
import { PROJECT_STATUS, PROJECT_TYPE } from "../project/project.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import User from "../user/user.model.js";
import Report from "../report/report.model.js";
import Post from "../communitypost/post.model.js";

const APPROVED_PROJECT_STATUSES = [
  PROJECT_STATUS.FUNDING,
  PROJECT_STATUS.RECRUITING,
  PROJECT_STATUS.ACTIVE,
  PROJECT_STATUS.EXECUTING,
];

const COMPLETED_PROJECT_STATUSES = [
  PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
  PROJECT_STATUS.COMPLETED_PARTIAL,
  PROJECT_STATUS.COMPLETED, // legacy compatibility
];

const CANCELLED_PROJECT_STATUSES = [
  PROJECT_STATUS.CANCELLED_BY_PLATFORM,
  PROJECT_STATUS.CANCELLED_BY_ORGANIZER,
  PROJECT_STATUS.CANCELLED_FRAUD,
  PROJECT_STATUS.CANCELLED, // legacy compatibility
];

const REVIEWABLE_PROJECT_STATUSES = [
  PROJECT_STATUS.PENDING_APPROVAL,
  PROJECT_STATUS.REVISION_REQUESTED,
  PROJECT_STATUS.UNDER_REVIEW,
];

class AdminService {
  constructor({
    adminRepository,
    projectRepository,
    userRepository,
    reportRepository,
    postRepository,
    transactionManager,
    jobQueue,
    eventBus,
    volunteerRepository,
    conversationService,
  }) {
    this.adminRepository = adminRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.reportRepository = reportRepository;
    this.postRepository = postRepository;
    this.transactionManager = transactionManager;
    this.jobQueue = jobQueue;
    this.eventBus = eventBus;
    this.volunteerRepository = volunteerRepository;
    this.conversationService = conversationService;
  }

  _ensureReason(reason) {
    const normalizedReason = String(reason || "").trim();

    if (!normalizedReason) {
      throw new AppError("Reason is required for this action.", 400);
    }

    return normalizedReason;
  }

  _normalizeProjectStatus(status) {
    return String(status || "").trim().toUpperCase();
  }

  _extractObjectId(value) {
    if (!value) return null;
    return typeof value === "object" ? value?._id || null : value;
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
    if (!this.adminRepository?.createAdminActionLog || !actorId || !targetId) {
      return null;
    }

    return this.adminRepository.createAdminActionLog({
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

  _buildProjectStatusNotificationMessage(projectTitle, status, feedback = "") {
    if (APPROVED_PROJECT_STATUSES.includes(status)) {
      return {
        title: "Project approved",
        message: `Your project "${projectTitle}" has been approved and is now active with status ${status}.`,
      };
    }

    if (status === PROJECT_STATUS.REVISION_REQUESTED) {
      return {
        title: "Project revision requested",
        message: `Your project "${projectTitle}" requires revision. Reason: ${feedback}. You have 14 days to update it.`,
      };
    }

    if (status === PROJECT_STATUS.REJECTED) {
      return {
        title: "Project rejected",
        message: `Your project "${projectTitle}" has been rejected. Reason: ${feedback}. Your account is blocked from creating new projects for 7 days.`,
      };
    }

    if (status === PROJECT_STATUS.PAUSED) {
      return {
        title: "Project paused",
        message: `Your project "${projectTitle}" has been paused. Reason: ${feedback || "No reason provided"}.`,
      };
    }

    if (COMPLETED_PROJECT_STATUSES.includes(status)) {
      return {
        title: "Project completed",
        message: `Your project "${projectTitle}" has been marked as completed. Note: ${feedback || "No note provided"}.`,
      };
    }

    if (CANCELLED_PROJECT_STATUSES.includes(status)) {
      return {
        title: "Project cancelled",
        message: `Your project "${projectTitle}" has been cancelled. Reason: ${feedback || "No reason provided"}.`,
      };
    }

    if (
      status === PROJECT_STATUS.PENDING_APPROVAL ||
      status === PROJECT_STATUS.UNDER_REVIEW
    ) {
      return {
        title: "Project submitted for review",
        message: `Your project "${projectTitle}" has been moved to review status. Note: ${feedback || "No note provided"}.`,
      };
    }

    return {
      title: "Project status updated",
      message: `The status of project "${projectTitle}" has been updated to ${status}.`,
    };
  }

  _emitProjectStatusUpdated({ project, actorId, feedback }) {
    if (!project?.organizerId) return;
    if (!this.eventBus || typeof this.eventBus.emit !== "function") return;

    const organizerId = this._extractObjectId(project.organizerId);
    if (!organizerId) return;

    const { title, message } = this._buildProjectStatusNotificationMessage(
      project.title,
      project.status,
      feedback
    );

    this.eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
      recipientIds: [String(organizerId)],
      actorId,
      projectId: project._id,
      projectName: project.title,
      status: project.status,
      title,
      message,
      actionUrl: `/projects/${project._id}`,
    });
  }

  _shouldEnsureProjectConversation(status) {
    return APPROVED_PROJECT_STATUSES.includes(
      this._normalizeProjectStatus(status)
    );
  }

  async _syncProjectConversation(project, adminId = null) {
    if (!project) return null;
    if (!this._shouldEnsureProjectConversation(project.status)) return null;
    if (!this.conversationService || !this.volunteerRepository) return null;

    const approvedApplications = await this.volunteerRepository.findByProject(
      project._id,
      "APPROVED"
    );

    const approvedVolunteerIds = (approvedApplications || [])
      .map((item) => String(item?.volunteerId?._id || item?.volunteerId || ""))
      .filter(Boolean);

    return this.conversationService.ensureProjectGroupConversation({
      projectId: project._id,
      organizerId: this._extractObjectId(project.organizerId),
      participantIds: approvedVolunteerIds,
      groupName: project.title,
      actorId: adminId,
    });
  }

  _getApprovedStatusForProject(project) {
    return project.projectType === PROJECT_TYPE.FUNDED
      ? PROJECT_STATUS.FUNDING
      : PROJECT_STATUS.RECRUITING;
  }

  _getResumeStatusForProject(project) {
    return project.projectType === PROJECT_TYPE.FUNDED
      ? PROJECT_STATUS.FUNDING
      : PROJECT_STATUS.RECRUITING;
  }

  _mapIncomingProjectStatus(project, rawStatus) {
    const normalized = this._normalizeProjectStatus(rawStatus);

    if (normalized === "PENDING") {
      return PROJECT_STATUS.PENDING_APPROVAL;
    }

    if (normalized === "APPROVED" || normalized === "ACTIVE") {
      return this._getApprovedStatusForProject(project);
    }

    if (normalized === "COMPLETED") {
      return PROJECT_STATUS.COMPLETED_SUCCESSFULLY;
    }

    if (normalized === "CANCELLED") {
      return PROJECT_STATUS.CANCELLED_BY_PLATFORM;
    }

    return normalized;
  }

  _getAllowedProjectTransitions(project) {
    const currentStatus = this._normalizeProjectStatus(project.status);

    switch (currentStatus) {
      case PROJECT_STATUS.PENDING_APPROVAL:
      case PROJECT_STATUS.REVISION_REQUESTED:
      case PROJECT_STATUS.UNDER_REVIEW:
        return [
          this._getApprovedStatusForProject(project),
          PROJECT_STATUS.REVISION_REQUESTED,
          PROJECT_STATUS.REJECTED,
        ];

      case PROJECT_STATUS.FUNDING:
      case PROJECT_STATUS.RECRUITING:
      case PROJECT_STATUS.ACTIVE:
      case PROJECT_STATUS.EXECUTING:
        return [
          PROJECT_STATUS.PAUSED,
          PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
          PROJECT_STATUS.CANCELLED_BY_PLATFORM,
        ];

      case PROJECT_STATUS.PAUSED:
        return [
          this._getResumeStatusForProject(project),
          PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
          PROJECT_STATUS.CANCELLED_BY_PLATFORM,
        ];

      default:
        return [];
    }
  }

  _buildProjectActionName(fromStatus, toStatus) {
    const normalizedFrom = this._normalizeProjectStatus(fromStatus);
    const normalizedTo = this._normalizeProjectStatus(toStatus);

    if (
      REVIEWABLE_PROJECT_STATUSES.includes(normalizedFrom) &&
      [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(normalizedTo)
    ) {
      return "APPROVE_PROJECT";
    }

    if (normalizedTo === PROJECT_STATUS.REVISION_REQUESTED) {
      return "REQUEST_PROJECT_REVISION";
    }

    if (normalizedTo === PROJECT_STATUS.REJECTED) {
      return "REJECT_PROJECT";
    }

    if (normalizedTo === PROJECT_STATUS.PAUSED) {
      return "PAUSE_PROJECT";
    }

    if (
      [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(normalizedTo) &&
      normalizedFrom === PROJECT_STATUS.PAUSED
    ) {
      return "RESUME_PROJECT";
    }

    if (COMPLETED_PROJECT_STATUSES.includes(normalizedTo)) {
      return "COMPLETE_PROJECT";
    }

    if (CANCELLED_PROJECT_STATUSES.includes(normalizedTo)) {
      return "CANCEL_PROJECT";
    }

    return "UPDATE_PROJECT_STATUS";
  }

  _buildProjectUpdateData(project, finalStatus, feedback, adminId) {
    const updateData = {
      status: finalStatus,
    };

    if (
      [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(finalStatus)
    ) {
      updateData.approvedBy = adminId;
      updateData.approvedAt = new Date();
      updateData.rejectionReason = null;
    }

    if (finalStatus === PROJECT_STATUS.REVISION_REQUESTED) {
      updateData.revisionCount = Number(project.revisionCount || 0) + 1;
      updateData.rejectionReason = feedback;
      updateData.revisionRequestedAt = new Date();
    }

    if (finalStatus === PROJECT_STATUS.REJECTED) {
      updateData.rejectionReason = feedback;
    }

    if (
      [
        PROJECT_STATUS.PENDING_APPROVAL,
        PROJECT_STATUS.UNDER_REVIEW,
        PROJECT_STATUS.PAUSED,
        PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
        PROJECT_STATUS.CANCELLED_BY_PLATFORM,
      ].includes(finalStatus)
    ) {
      updateData.rejectionReason = feedback || null;
    }

    return updateData;
  }

  _isApproveAction(currentStatus, finalStatus) {
    return (
      REVIEWABLE_PROJECT_STATUSES.includes(
        this._normalizeProjectStatus(currentStatus)
      ) &&
      [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(
        this._normalizeProjectStatus(finalStatus)
      )
    );
  }

  async updateProjectStatus(projectId, targetStatus, feedback, adminId) {
    if (!targetStatus) {
      throw new AppError("Project status is required.", 400);
    }

    return this.transactionManager.runInTransaction(async (session) => {
      const project = await this.projectRepository.findById(projectId, session);

      if (!project) {
        throw new AppError("Project not found.", 404);
      }

      const currentStatus = this._normalizeProjectStatus(project.status);
      const finalStatus = this._mapIncomingProjectStatus(project, targetStatus);
      const allowedTransitions = this._getAllowedProjectTransitions(project);

      if (currentStatus === finalStatus) {
        return project;
      }

      if (!allowedTransitions.includes(finalStatus)) {
        throw new AppError(
          `Cannot transition project from ${currentStatus} to ${finalStatus}`,
          400
        );
      }

      const isApproveAction = this._isApproveAction(currentStatus, finalStatus);
      const normalizedFeedback = isApproveAction
        ? String(feedback || "").trim()
        : this._ensureReason(feedback);

      if (
        finalStatus === PROJECT_STATUS.REVISION_REQUESTED &&
        Number(project.revisionCount || 0) >= 2
      ) {
        throw new AppError(
          "The project has exceeded the maximum of 2 revision requests.",
          400
        );
      }

      const updateData = this._buildProjectUpdateData(
        project,
        finalStatus,
        normalizedFeedback,
        adminId
      );

      let userUpdate = null;

      if (finalStatus === PROJECT_STATUS.REJECTED) {
        const coolingPeriodEnd = new Date();
        coolingPeriodEnd.setDate(coolingPeriodEnd.getDate() + 7);
        userUpdate = { coolingPeriodEnd };
      }

      const updatedProject = await this.projectRepository.updateById(
        projectId,
        updateData,
        session
      );

      if (!updatedProject) {
        throw new AppError("Failed to update project status.", 500);
      }

      if (userUpdate) {
        await this.userRepository.updateById(
          this._extractObjectId(project.organizerId),
          userUpdate,
          session
        );
      }

      if (finalStatus === PROJECT_STATUS.REVISION_REQUESTED && this.jobQueue) {
        this.jobQueue
          .addJob(
            "project-maintenance",
            "check-revision-timeout",
            { projectId },
            { delay: 14 * 24 * 60 * 60 * 1000 }
          )
          .catch((err) =>
            console.error(
              `[Queue] Failed to schedule timeout for ${projectId}`,
              err.message
            )
          );
      }

      if (this._shouldEnsureProjectConversation(updatedProject?.status)) {
        await this._syncProjectConversation(updatedProject, adminId);
      }

      await this._logAdminAction({
        actorId: adminId,
        actorRole: "admin",
        targetType: "project",
        targetId: updatedProject._id,
        action: this._buildProjectActionName(currentStatus, finalStatus),
        reason:
          normalizedFeedback ||
          (isApproveAction
            ? `Approve project to ${finalStatus}`
            : `Change status to ${finalStatus}`),
        previousState: {
          status: currentStatus,
          projectType: project.projectType,
          title: project.title,
        },
        nextState: {
          status: finalStatus,
          projectType: updatedProject.projectType,
          title: updatedProject.title,
        },
        metadata: {
          projectTitle: updatedProject.title,
          projectType: updatedProject.projectType,
          organizerId: this._extractObjectId(updatedProject.organizerId),
        },
      });

      this._emitProjectStatusUpdated({
        project: updatedProject,
        actorId: adminId,
        feedback: updateData.rejectionReason,
      });

      return updatedProject;
    });
  }

  async deleteProject(projectId, reason, adminId = null) {
    const normalizedReason = this._ensureReason(reason);

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Project not found.", 404);
    }

    const deletedProject = await this.projectRepository.deleteById(projectId);
    if (!deletedProject) {
      throw new AppError("Failed to delete project.", 500);
    }

    await this._logAdminAction({
      actorId: adminId,
      actorRole: "admin",
      targetType: "project",
      targetId: project._id,
      action: "DELETE_PROJECT",
      reason: normalizedReason,
      previousState: {
        status: project.status,
        projectType: project.projectType,
        title: project.title,
      },
      nextState: {
        status: "DELETED",
        projectType: project.projectType,
        title: project.title,
      },
      metadata: {
        projectTitle: project.title,
        projectType: project.projectType,
        organizerId: this._extractObjectId(project.organizerId),
      },
    });

    return deletedProject;
  }

  async getDashboardStats() {
    return this.adminRepository.getSystemStats();
  }

  async getUsers(query = null) {
    if (query && (query.search || query.page || query.limit || query.role)) {
      return this.adminRepository.findUsers(query);
    }

    return this.adminRepository.findAllUsers();
  }

  async getActionLogs(query = {}) {
    if (!this.adminRepository?.findAdminActionLogs) {
      throw new AppError("Admin action log repository is not available.", 500);
    }

    return this.adminRepository.findAdminActionLogs(query);
  }

  async getProjects(query = {}) {
    if (typeof this.adminRepository.findProjects === "function") {
      return this.adminRepository.findProjects(query);
    }

    if (typeof this.adminRepository.findAllProjects === "function") {
      return this.adminRepository.findAllProjects(query);
    }

    if (typeof this.adminRepository.findProjectsForReview === "function") {
      return this.adminRepository.findProjectsForReview({
        skip: 0,
        limit: 50,
      });
    }

    return [];
  }

  async getReports() {
    return this.adminRepository.findAllReports();
  }

  async toggleUserBan(userId, reason, actorId = null, actorRole = "admin") {
    const normalizedReason = this._ensureReason(reason);

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found.", 404);
    }

    const previousState = {
      status: user.status || null,
      isActive: user.isActive,
      isVerified: user.isVerified,
    };

    const nextStatus = user.isActive ? "banned" : "active";

    const updatedUser = await User.findByIdAndUpdate(
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

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      throw new AppError("User not found.", 404);
    }

    const isActive = normalizedStatus !== "banned";

    const updatedUser = await User.findByIdAndUpdate(
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

  async resolveReportWithActions(reportId, actions, note) {
    const report = await Report.findById(reportId).populate("target_ref");
    if (!report) {
      throw new AppError("Report not found.", 404);
    }

    if (actions.includes("delete_content")) {
      if (
        String(report.target_type || "").toLowerCase() === "post" &&
        report.target_ref
      ) {
        await Post.findByIdAndDelete(report.target_ref._id);
      }
    }

    if (actions.includes("ban_user")) {
      const targetType = String(report.target_type || "").toLowerCase();

      if (targetType === "user" && report.target_ref?._id) {
        throw new AppError(
          "Banning a user from report resolution now requires a dedicated admin reason flow.",
          400
        );
      }

      const authorId = report.target_ref?.author;
      if (authorId) {
        throw new AppError(
          "Banning an author from report resolution now requires a dedicated admin reason flow.",
          400
        );
      }
    }

    report.status = "resolved";
    report.action = actions.length > 0 ? actions.join(",") : "none";
    report.decision_note = note;
    report.reviewed_at = new Date();

    await report.save();

    return report;
  }

  async createSystemNotification({
    title,
    message,
    targetType = "all",
    role = null,
    roles = [],
    userIds = [],
    severity = "info",
    actorId = null,
    actorRole = null,
  }) {
    if (String(actorRole || "").toLowerCase() !== "admin") {
      throw new AppError("Only admin can create system notifications.", 403);
    }

    const normalizedTitle = String(title || "").trim();
    const normalizedMessage = String(message || "").trim();
    const normalizedSeverity = String(severity || "info")
      .trim()
      .toLowerCase();
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

    if (!["all", "role", "users", "custom"].includes(normalizedTargetType)) {
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

    if (normalizedTargetType === "role") {
      const normalizedRole = String(role || "").trim().toLowerCase();

      if (!normalizedRole) {
        throw new AppError("Role is required when targetType is 'role'.", 400);
      }

      await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
        ...basePayload,
        role: normalizedRole,
      });

      return {
        success: true,
        targetType: "role",
        role: normalizedRole,
        title: normalizedTitle,
        message: normalizedMessage,
      };
    }

    if (normalizedTargetType === "users") {
      const normalizedUserIds = [
        ...new Set(
          (userIds || []).map((id) => String(id).trim()).filter(Boolean)
        ),
      ];

      if (!normalizedUserIds.length) {
        throw new AppError(
          "At least one user ID is required when targetType is 'users'.",
          400
        );
      }

      await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
        ...basePayload,
        userIds: normalizedUserIds,
      });

      return {
        success: true,
        targetType: "users",
        totalRecipients: normalizedUserIds.length,
        userIds: normalizedUserIds,
        title: normalizedTitle,
        message: normalizedMessage,
      };
    }

    if (normalizedTargetType === "custom") {
      const normalizedRoles = [
        ...new Set(
          (roles || [])
            .map((item) => String(item).trim().toLowerCase())
            .filter(Boolean)
        ),
      ].filter((item) => ["user", "organizer", "admin"].includes(item));

      const normalizedUserIds = [
        ...new Set(
          (userIds || []).map((id) => String(id).trim()).filter(Boolean)
        ),
      ];

      if (!normalizedRoles.length && !normalizedUserIds.length) {
        throw new AppError(
          "At least one role or one user is required for custom recipients.",
          400
        );
      }

      await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
        ...basePayload,
        roles: normalizedRoles,
        userIds: normalizedUserIds,
      });

      return {
        success: true,
        targetType: "custom",
        roles: normalizedRoles,
        userIds: normalizedUserIds,
        totalRoles: normalizedRoles.length,
        totalUsers: normalizedUserIds.length,
        title: normalizedTitle,
        message: normalizedMessage,
      };
    }

    await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
      ...basePayload,
    });

    return {
      success: true,
      targetType: "all",
      title: normalizedTitle,
      message: normalizedMessage,
    };
  }
}

export default AdminService;