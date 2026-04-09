import AppError from "../../core/AppError.js";
import { PROJECT_STATUS, PROJECT_TYPE } from "../project/project.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import User from "../user/user.model.js";
import Report from "../report/report.model.js";
import Post from "../communitypost/post.model.js";

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

  _buildProjectStatusNotificationMessage(projectTitle, status, feedback = "") {
    if (
      [
        PROJECT_STATUS.FUNDING,
        PROJECT_STATUS.RECRUITING,
        PROJECT_STATUS.ACTIVE,
      ].includes(status)
    ) {
      return {
        title: "Dự án đã được phê duyệt",
        message: `Dự án "${projectTitle}" của bạn đã được Ban quản trị phê duyệt và đang đi vào hoạt động (Trạng thái: ${status}).`,
      };
    }

    if (status === PROJECT_STATUS.REVISION_REQUESTED) {
      return {
        title: "Dự án cần chỉnh sửa",
        message: `Dự án "${projectTitle}" của bạn cần được chỉnh sửa. Lý do: ${feedback}. Bạn có 14 ngày để bổ sung.`,
      };
    }

    if (status === PROJECT_STATUS.REJECTED) {
      return {
        title: "Dự án bị từ chối",
        message: `Dự án "${projectTitle}" đã bị từ chối. Lý do: ${feedback}. Tài khoản của bạn bị tạm ngưng tạo dự án mới trong 7 ngày.`,
      };
    }

    return {
      title: "Cập nhật trạng thái dự án",
      message: `Trạng thái dự án "${projectTitle}" đã được cập nhật thành ${status}.`,
    };
  }

  _emitProjectStatusUpdated = ({ project, actorId, feedback }) => {
    if (!project?.organizerId) return;
    if (!this.eventBus || typeof this.eventBus.emit !== "function") return;

    const { title, message } = this._buildProjectStatusNotificationMessage(
      project.title,
      project.status,
      feedback
    );

    this.eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
      recipientIds: [String(project.organizerId)],
      actorId,
      projectId: project._id,
      projectName: project.title,
      status: project.status,
      title,
      message,
      actionUrl: `/projects/${project._id}`,
    });
  };

  _syncProjectConversationOnActive = async (project, adminId = null) => {
    if (!project || String(project.status) !== PROJECT_STATUS.ACTIVE) return null;
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
      organizerId: project.organizerId,
      participantIds: approvedVolunteerIds,
      groupName: project.title,
      actorId: adminId,
    });
  };

  updateProjectStatus = async (projectId, targetStatus, feedback, adminId) => {
    if (!targetStatus) {
      throw new AppError("Trạng thái không được để trống", 400);
    }

    const normalized = String(targetStatus).trim().toUpperCase();

    return await this.transactionManager.runInTransaction(async (session) => {
      const project = await this.projectRepository.findById(projectId, session);
      if (!project) throw new AppError("Không tìm thấy dự án", 404);

      if (
        ![
          PROJECT_STATUS.PENDING_APPROVAL,
          PROJECT_STATUS.REVISION_REQUESTED,
        ].includes(project.status)
      ) {
        throw new AppError(
          `Không thể duyệt dự án đang ở trạng thái ${project.status}`,
          400
        );
      }

      let finalStatus = null;
      const updateData = {};
      let userUpdate = null;

      let mappedIntent = normalized;
      if (normalized === "PENDING") mappedIntent = PROJECT_STATUS.PENDING_APPROVAL;
      if (normalized === "APPROVED" || normalized === "ACTIVE") {
        mappedIntent = "APPROVED_INTENT";
      }

      if (mappedIntent === PROJECT_STATUS.REVISION_REQUESTED) {
        if (!feedback) {
          throw new AppError(
            "Bắt buộc phải cung cấp lý do (feedback) khi yêu cầu chỉnh sửa",
            400
          );
        }

        const currentRevisions = project.revisionCount || 0;
        if (currentRevisions >= 2) {
          finalStatus = PROJECT_STATUS.REJECTED;
          updateData.status = finalStatus;
          updateData.rejectionReason =
            "Đã vượt quá giới hạn 2 lần yêu cầu sửa đổi. Dự án tự động bị từ chối.";
        } else {
          finalStatus = PROJECT_STATUS.REVISION_REQUESTED;
          updateData.status = finalStatus;
          updateData.revisionCount = currentRevisions + 1;
          updateData.rejectionReason = feedback;
          updateData.revisionRequestedAt = new Date();

          if (this.jobQueue) {
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
        }
      }

      if (mappedIntent === PROJECT_STATUS.REJECTED) {
        if (!feedback && !updateData.rejectionReason) {
          throw new AppError("Bắt buộc phải có lý do từ chối", 400);
        }

        finalStatus = PROJECT_STATUS.REJECTED;
        updateData.status = finalStatus;
        updateData.rejectionReason = updateData.rejectionReason || feedback;

        const coolingPeriodEnd = new Date();
        coolingPeriodEnd.setDate(coolingPeriodEnd.getDate() + 7);
        userUpdate = { coolingPeriodEnd };
      }

      if (mappedIntent === "APPROVED_INTENT") {
        finalStatus =
          project.projectType === PROJECT_TYPE.FUNDED
            ? PROJECT_STATUS.FUNDING
            : PROJECT_STATUS.RECRUITING;

        updateData.status = finalStatus;
        updateData.approvedBy = adminId;
        updateData.approvedAt = new Date();
      }

      if (!finalStatus) {
        throw new AppError("Trạng thái không hợp lệ", 400);
      }

      const updatedProject = await this.projectRepository.updateById(
        projectId,
        updateData,
        session
      );

      if (userUpdate) {
        await this.userRepository.updateById(
          project.organizerId,
          userUpdate,
          session
        );
      }

      if (String(updatedProject?.status) === PROJECT_STATUS.ACTIVE) {
        await this._syncProjectConversationOnActive(updatedProject, adminId);
      }

      this._emitProjectStatusUpdated({
        project: updatedProject,
        actorId: adminId,
        feedback: updateData.rejectionReason,
      });

      return updatedProject;
    });
  };

  deleteProject = async (projectId) => {
    const project = await this.projectRepository.deleteById(projectId);
    if (!project) throw new AppError("Không tìm thấy dự án", 404);
    return project;
  };

  getDashboardStats = async () => {
    return await this.adminRepository.getSystemStats();
  };

  getUsers = async (query = null) => {
    if (query && (query.search || query.page || query.limit || query.role)) {
      return await this.adminRepository.findUsers(query);
    }

    return await this.adminRepository.findAllUsers();
  };

  getProjects = async () => {
    if (typeof this.adminRepository.findProjectsForReview === "function") {
      return await this.adminRepository.findProjectsForReview({
        skip: 0,
        limit: 50,
      });
    }

    return await this.adminRepository.findProjects();
  };

  getReports = async () => {
    return await this.adminRepository.findAllReports();
  };

  toggleUserBan = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const nextStatus = user.isActive ? "banned" : "active";
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { isActive: !user.isActive, status: nextStatus } },
      { new: true }
    );

    return updatedUser;
  };

  verifyUser = async (userId, isVerified) => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isVerified: Boolean(isVerified) } },
      { new: true }
    );

    if (!user) throw new Error("User not found");
    return user;
  };

  updateUserStatus = async (userId, status) => {
    const allowed = new Set(["active", "inactive", "banned"]);
    if (!allowed.has(status)) {
      throw new Error("Invalid user status");
    }

    const isActive = status !== "banned";
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { status, isActive } },
      { new: true }
    );

    if (!updatedUser) throw new Error("User not found");
    return updatedUser;
  };

  resolveReportWithActions = async (reportId, actions, note) => {
    const report = await Report.findById(reportId).populate("target_ref");
    if (!report) throw new Error("Report not found");

    if (actions.includes("delete_content")) {
      if (report.target_type.toLowerCase() === "post" && report.target_ref) {
        await Post.findByIdAndDelete(report.target_ref._id);
      }
    }

    if (actions.includes("ban_user")) {
      const authorId = report.target_ref?.author;
      if (authorId) {
        await this.toggleUserBan(authorId);
      }
    }

    report.status = "resolved";
    report.action = actions.length > 0 ? actions.join(",") : "none";
    report.decision_note = note;
    report.reviewed_at = new Date();

    await report.save();
    return report;
  };

  createSystemNotification = async ({
    title,
    message,
    targetType = "all",
    role = null,
    roles = [],
    userIds = [],
    severity = "info",
    actorId = null,
    actorRole = null,
  }) => {
    if (String(actorRole || "").toLowerCase() !== "admin") {
      throw new Error("Only admin can create system notifications.");
    }

    const normalizedTitle = String(title || "").trim();
    const normalizedMessage = String(message || "").trim();
    const normalizedSeverity = String(severity || "info").trim().toLowerCase();
    const normalizedTargetType = String(targetType || "all").trim().toLowerCase();

    if (!normalizedTitle) {
      throw new Error("Title is required");
    }

    if (!normalizedMessage) {
      throw new Error("Message is required");
    }

    if (!["info", "success", "warning", "error"].includes(normalizedSeverity)) {
      throw new Error("Invalid severity");
    }

    if (!["all", "role", "users", "custom"].includes(normalizedTargetType)) {
      throw new Error("Invalid targetType");
    }

    if (!this.eventBus || typeof this.eventBus.emit !== "function") {
      throw new Error("Notification event bus is not available");
    }

    const payload = {
      title: normalizedTitle,
      message: normalizedMessage,
      severity: normalizedSeverity,
      actorId,
    };

    if (normalizedTargetType === "role") {
      const normalizedRole = String(role || "").trim().toLowerCase();

      if (!normalizedRole) {
        throw new Error("Role is required when targetType is role");
      }

      await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
        ...payload,
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
        ...new Set((userIds || []).map((id) => String(id).trim()).filter(Boolean)),
      ];

      if (!normalizedUserIds.length) {
        throw new Error("At least one userId is required when targetType is users");
      }

      await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
        ...payload,
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
        ...new Set((userIds || []).map((id) => String(id).trim()).filter(Boolean)),
      ];

      if (!normalizedRoles.length && !normalizedUserIds.length) {
        throw new Error("At least one role or one user is required for custom recipients");
      }

      await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
        ...payload,
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
      ...payload,
    });

    return {
      success: true,
      targetType: "all",
      title: normalizedTitle,
      message: normalizedMessage,
    };
  };
}

export default AdminService;