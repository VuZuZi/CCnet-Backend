// backend/src/modules/admin/admin.service.js
import { PROJECT_STATUS } from "../project/project.constant.js";
import mongoose from "mongoose";

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
    return await this.adminRepository.findAllProjects();
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

    const project = await this.adminRepository.updateProjectStatus(projectId, mapped);
    if (!project) throw new Error("Project not found");

    return project;
  };

  deleteProject = async (projectId) => {
    const project = await this.adminRepository.deleteProject(projectId);
    if (!project) throw new Error("Project not found");
    return project;
  };

  getReports = async () => {
    return await this.adminRepository.findAllReports();
  };

  toggleUserBan = async (userId) => {
    const user = await this.adminRepository.toggleUserBan(userId);
    if (!user) throw new Error("User not found");
    return user;
  };

  setUserVerified = async (userId, isVerified) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error("Invalid user ID");

    let nextValue = isVerified;
    if (typeof nextValue !== "boolean") {
      const current = await this.adminRepository.findUserById(userId);
      if (!current) throw new Error("User not found");
      nextValue = !Boolean(current.isVerified);
    }

    const updated = await this.adminRepository.setUserVerified(userId, nextValue);
    if (!updated) throw new Error("User not found");
    return updated;
  };

  resolveReportWithActions = async (reportId, actions, note) => {
    const report = await this.adminRepository.findReportById(reportId);
    if (!report) throw new Error("Report not found");

    if (actions.includes("delete_content")) {
      if (report.target_type.toLowerCase() === "post" && report.target_ref) {
        await this.adminRepository.deletePost(report.target_ref._id);
      }
    }

    if (actions.includes("ban_user")) {
      const authorId = report.target_ref?.author;
      if (authorId) {
        await this.toggleUserBan(authorId);
      }
    }

    const updatedReport = await this.adminRepository.updateReport(reportId, {
      status: "resolved",
      action: actions.length > 0 ? actions.join(",") : "none",
      decision_note: note,
      reviewed_at: new Date(),
    });

    return updatedReport;
  };

  createSystemNotification = async (notificationData) => {
    const { title, message, recipient } = notificationData;

    if (!title || !message) {
      throw new Error("Title and message are required to send a notification.");
    }

    const notification = await this.adminRepository.createNotification({
      title,
      message,
      recipient: recipient || "all",
      sender: "system",
    });

    return notification;
  };
}

export default AdminService;