import Post from "../communitypost/post.model.js";
import Report from "../report/report.model.js";
import User from "../user/user.model.js";
import Project from "../project/project.model.js";
import { PROJECT_STATUS } from "../project/project.constant.js";
import { eventBus, DOMAIN_EVENTS } from "../../config/notification.js";

class AdminService {
  constructor({ adminRepository }) {
    this.adminRepository = adminRepository;
    this.notificationEventBus = eventBus;
  }

  getDashboardStats = async () => {
    return await this.adminRepository.getSystemStats();
  };

  getUsers = async () => {
    return await this.adminRepository.findAllUsers();
  };

  getProjects = async () => {
    return await Project.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      { $unwind: "$organizer" },
      {
        $lookup: {
          from: "projects",
          localField: "organizerId",
          foreignField: "organizerId",
          as: "organizerProjects",
        },
      },
      {
        $addFields: {
          "organizer.projectCount": { $size: "$organizerProjects" },
        },
      },
      {
        $project: {
          organizerProjects: 0,
          "organizer.password": 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
  };

  _buildProjectStatusNotificationMessage(projectTitle, status) {
    if (status === PROJECT_STATUS.ACTIVE) {
      return {
        title: "Project approved",
        message: `Your project "${projectTitle}" has been approved by admin.`,
      };
    }

    if (status === PROJECT_STATUS.CANCELLED) {
      return {
        title: "Project rejected",
        message: `Your project "${projectTitle}" has been rejected by admin.`,
      };
    }

    return {
      title: "Project status updated",
      message: `Your project "${projectTitle}" status has been updated to ${status}.`,
    };
  }

  _emitProjectStatusUpdated = async ({ project, actorId }) => {
    if (!project?.organizerId) return;
    if (!this.notificationEventBus || typeof this.notificationEventBus.emit !== "function") {
      return;
    }

    const { title, message } = this._buildProjectStatusNotificationMessage(
      project.title,
      project.status,
    );

    await this.notificationEventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
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

  updateProjectStatus = async (projectId, status, adminId = null) => {
    if (!status) throw new Error("Status is required");

    const normalized = String(status).trim().toUpperCase();
    const mapped =
      normalized === "PENDING" ? PROJECT_STATUS.PENDING_APPROVAL : normalized;

    const allowed = new Set(Object.values(PROJECT_STATUS));
    if (!allowed.has(mapped)) {
      throw new Error("Invalid status");
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { $set: { status: mapped } },
      { new: true },
    )
      .select("status title organizerId targetAmount currentAmount stats needsVolunteers")
      .lean()
      .exec();

    if (!project) throw new Error("Project not found");

    await this._emitProjectStatusUpdated({
      project,
      actorId: adminId,
    });

    return project;
  };

  deleteProject = async (projectId) => {
    const project = await Project.findByIdAndDelete(projectId);
    if (!project) throw new Error("Project not found");
    return project;
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