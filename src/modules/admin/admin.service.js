import Post from "../communitypost/post.model.js";
import Report from "../report/report.model.js";
class AdminService {
  constructor({ adminRepository, notificationRepository }) {
    this.adminRepository = adminRepository;
    this.notificationRepository = notificationRepository;
  }

  async getDashboardStats() {
    return await this.adminRepository.getSystemStats();
  }

  async getUsers() {
    return await this.adminRepository.findAllUsers();
  }

  async toggleUserBan(userId, reason) {
    const user = await this.adminRepository.findUserById(userId);
    if (!user) throw new Error("User not found");

    const newStatus = !user.isBanned;

    await this.notificationRepository.create({
      recipient: userId,
      type: "alert",
      title: newStatus ? "Account Banned" : "Account Restored",
      message: newStatus
        ? `You have been banned. Reason: ${reason}`
        : "Your account access has been restored.",
    });

    return await this.adminRepository.updateUser(userId, {
      isBanned: newStatus,
      banReason: newStatus ? reason : null,
    });
  }

  async createSystemNotification(data) {
    return await this.notificationRepository.create({
      recipient: data.recipient || null,
      title: data.title,
      message: data.message,
      type: "system",
    });
  }

  async getReports() {
    return await this.adminRepository.findAllReports();
  }

  async resolveReportWithActions(reportId, actions, note) {
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
        await this.toggleUserBan(
          authorId,
          `Report Resolution #${reportId}: ${note}`,
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

  async getProjects() {
    return await this.adminRepository.findAllProjects();
  }

  async deleteProject(id) {
    return await this.adminRepository.deleteProject(id);
  }
}
export default AdminService;
