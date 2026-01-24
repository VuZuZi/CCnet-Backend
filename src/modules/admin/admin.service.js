import Post from "../communitypost/post.model.js";
import Report from "../report/report.model.js";
import User from "../user/user.model.js";
import Notification from "../notification/notification.model.js";
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
