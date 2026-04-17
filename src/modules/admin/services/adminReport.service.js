import AppError from "../../../core/AppError.js";

class AdminReportService {
  constructor({ adminReportRepository, adminUserService }) {
    this.adminReportRepository = adminReportRepository;
    this.adminUserService = adminUserService;
  }

  async resolveReportWithActions(reportId, actions, note, actorId = null, actorRole = "admin") {
    const report = await this.adminReportRepository.findReportById(reportId);
    if (!report) {
      throw new AppError("Report not found.", 404);
    }

    if (actions.includes("delete_content")) {
      if (
        String(report.target_type || "").toLowerCase() === "post" &&
        report.target_ref
      ) {
        await this.adminReportRepository.deletePostById(report.target_ref._id);
      }
    }

    if (actions.includes("ban_user")) {
      const targetType = String(report.target_type || "").toLowerCase();

      if (targetType === "user" && report.target_ref?._id) {
        await this.adminUserService.toggleUserBan(
          report.target_ref._id,
          `Ban user from report resolution #${String(report._id).slice(-6)}`,
          actorId,
          actorRole
        );
      }

      const authorId = report.target_ref?.author;
      if (authorId) {
        await this.adminUserService.toggleUserBan(
          authorId,
          `Ban author from report resolution #${String(report._id).slice(-6)}`,
          actorId,
          actorRole
        );
      }
    }

    report.status = "resolved";
    report.action = actions.length > 0 ? actions.join(",") : "none";
    report.decision_note = note;
    report.reviewed_at = new Date();

    await this.adminReportRepository.saveReport(report);

    return report;
  }
}

export default AdminReportService;