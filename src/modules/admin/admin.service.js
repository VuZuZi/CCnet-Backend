import Post from "../communitypost/post.model.js";
import Report from "../report/report.model.js";
import User from "../user/user.model.js";
import Notification from "../notification/notification.model.js";
import Project from "../project/project.model.js";
import { PROJECT_STATUS } from "../project/project.constant.js";

class AdminService {
  constructor({ adminRepository, notificationRepository }) {
    this.adminRepository = adminRepository;
    this.notificationRepository = notificationRepository;
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
        // 1. Join với bảng users để lấy thông tin organizer
        $lookup: {
          from: "users",
          localField: "organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      { $unwind: "$organizer" },
      {
        // 2. Join ngược lại với bảng projects để đếm số lượng dự án của organizer đó
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

  updateProjectStatus = async (projectId, status) => {
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
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { isActive: !user.isActive } },
      { new: true },
    );

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
  createSystemNotification = async (notificationData) => {
    const { title, message, recipient } = notificationData;

    if (!title || !message) {
      throw new Error("Title and message are required to send a notification.");
    }

    const notification = new Notification({
      title,
      message,
      recipient: recipient || "all",
      sender: "system",
    });

    await notification.save();

    return notification;
  };
}

export default AdminService;
