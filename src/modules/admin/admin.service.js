import AppError from "../../core/AppError.js";
import { PROJECT_STATUS, PROJECT_TYPE } from "../project/project.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import User from "../user/user.model.js";

class AdminService {
  constructor({
    adminRepository,
    projectRepository,
    userRepository,
    reportRepository,
    postRepository,
    transactionManager,
    jobQueue,
    eventBus
  }) {
    this.adminRepository = adminRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.reportRepository = reportRepository;
    this.postRepository = postRepository;
    this.transactionManager = transactionManager;
    this.jobQueue = jobQueue; 
    this.eventBus = eventBus;
  }


  _buildProjectStatusNotificationMessage(projectTitle, status, feedback) {
    if ([PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING, PROJECT_STATUS.ACTIVE].includes(status)) {
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

  updateProjectStatus = async (projectId, targetStatus, feedback, adminId) => {
    if (!targetStatus) throw new AppError("Trạng thái không được để trống", 400);

    const normalized = String(targetStatus).trim().toUpperCase();
    
    return await this.transactionManager.runInTransaction(async (session) => {
      const project = await this.projectRepository.findById(projectId, session);
      if (!project) throw new AppError("Không tìm thấy dự án", 404);

      if (![PROJECT_STATUS.PENDING_APPROVAL, PROJECT_STATUS.REVISION_REQUESTED].includes(project.status)) {
        throw new AppError(`Không thể duyệt dự án đang ở trạng thái ${project.status}`, 400);
      }

      let finalStatus = null;
      let updateData = {};
      let userUpdate = null;

      // 1. Phân luồng Ý định (Intent) từ request
      let mappedIntent = normalized;
      if (normalized === "PENDING") mappedIntent = PROJECT_STATUS.PENDING_APPROVAL;
      if (normalized === "APPROVED" || normalized === "ACTIVE") mappedIntent = "APPROVED_INTENT";

      // 2. Xử lý Logic Business theo Intent
      if (mappedIntent === PROJECT_STATUS.REVISION_REQUESTED) {
        if (!feedback) throw new AppError("Bắt buộc phải cung cấp lý do (feedback) khi yêu cầu chỉnh sửa", 400);

        const currentRevisions = project.revisionCount || 0;
        if (currentRevisions >= 2) {
          finalStatus = PROJECT_STATUS.REJECTED;
          updateData.rejectionReason = "Đã vượt quá giới hạn 2 lần yêu cầu sửa đổi. Dự án tự động bị từ chối.";
        } else {
          finalStatus = PROJECT_STATUS.REVISION_REQUESTED;
          updateData.status = finalStatus;
          updateData.revisionCount = currentRevisions + 1;
          updateData.rejectionReason = feedback;
          updateData.revisionRequestedAt = new Date();

          // [WORKER] Bắn job delay 14 ngày đếm ngược Timeout Auto-Reject
          if (this.jobQueue) {
            this.jobQueue.addJob(
              "project-maintenance", 
              "check-revision-timeout", 
              { projectId }, 
              { delay: 14 * 24 * 60 * 60 * 1000 } // 14 ngày
            ).catch(err => console.error(`[Queue] Failed to schedule timeout for ${projectId}`, err.message));
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
        finalStatus = project.projectType === PROJECT_TYPE.FUNDED 
          ? PROJECT_STATUS.FUNDING 
          : PROJECT_STATUS.RECRUITING;

        updateData.status = finalStatus;
        updateData.approvedBy = adminId;
        updateData.approvedAt = new Date();
      }

      if (!finalStatus) throw new AppError("Trạng thái không hợp lệ", 400);

      const updatedProject = await this.projectRepository.updateById(projectId, updateData, session);

      if (userUpdate) {
        await this.userRepository.updateById(project.organizerId, userUpdate, session);
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

  getUsers = async () => {
    return await this.adminRepository.findAllUsers();
  };

  getProjects = async () => {
    return await this.adminRepository.findProjectsForReview({ skip: 0, limit: 50 });
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
      { new: true },
    );

    return updatedUser;
  };

  verifyUser = async (userId, isVerified) => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isVerified: Boolean(isVerified) } },
      { new: true },
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
      { new: true },
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
}

export default AdminService;