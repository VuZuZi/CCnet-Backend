import AppError from "../../core/AppError.js";
import { PROJECT_STATUS } from "../project/project.constant.js";

const COCKPIT_REQUIRED_MESSAGE =
  "Vui lòng sử dụng cockpit kiểm duyệt để xử lý hồ sơ dự án.";

const REVIEW_STAGE_STATUSES = new Set([
  PROJECT_STATUS.PENDING_APPROVAL,
  PROJECT_STATUS.REVISION_REQUESTED,
  PROJECT_STATUS.UNDER_REVIEW,
]);

const LEGACY_REVIEW_DECISION_STATUSES = new Set([
  "APPROVED",
  "ACTIVE",
  PROJECT_STATUS.FUNDING,
  PROJECT_STATUS.RECRUITING,
  PROJECT_STATUS.REVISION_REQUESTED,
  PROJECT_STATUS.REJECTED,
]);

class AdminService {
  constructor({
    adminDashboardService,
    adminUserService,
    adminProjectService,
    projectReviewService,
    adminReportService,
    adminNotificationService,
  }) {
    this.adminDashboardService = adminDashboardService;
    this.adminUserService = adminUserService;
    this.adminProjectService = adminProjectService;
    this.projectReviewService = projectReviewService;
    this.adminReportService = adminReportService;
    this.adminNotificationService = adminNotificationService;
  }

  getDashboardStats(...args) {
    return this.adminDashboardService.getDashboardStats(...args);
  }

  getUsers(...args) {
    return this.adminDashboardService.getUsers(...args);
  }

  getUserDetail(...args) {
    return this.adminUserService.getUserDetail(...args);
  }

  getActionLogs(...args) {
    return this.adminDashboardService.getActionLogs(...args);
  }

  getOrganizerActionLogs(...args) {
    return this.adminDashboardService.getOrganizerActionLogs(...args);
  }

  getProjects(...args) {
    return this.adminDashboardService.getProjects(...args);
  }

  getProjectDetail(...args) {
    return this.adminProjectService.getProjectDetail(...args);
  }

  getReports(...args) {
    return this.adminDashboardService.getReports(...args);
  }

  toggleUserBan(...args) {
    return this.adminUserService.toggleUserBan(...args);
  }

  updateUserStatus(...args) {
    return this.adminUserService.updateUserStatus(...args);
  }

  async updateProjectStatus(projectId, status, ...args) {
    const project = await this.adminProjectService.getProjectDetail(projectId);
    const currentStatus = String(project?.status || "").toUpperCase();
    const requestedStatus = String(status || "").trim().toUpperCase();

    if (
      REVIEW_STAGE_STATUSES.has(currentStatus) &&
      LEGACY_REVIEW_DECISION_STATUSES.has(requestedStatus)
    ) {
      throw new AppError(COCKPIT_REQUIRED_MESSAGE, 409);
    }

    return this.adminProjectService.updateProjectStatus(projectId, status, ...args);
  }

  getProjectReview(...args) {
    return this.projectReviewService.getAdminReview(...args);
  }

  listProjectAIReviewRuns(...args) {
    return this.projectReviewService.listAIReviewRuns(...args);
  }

  getLatestProjectAIReviewRun(...args) {
    return this.projectReviewService.getLatestAIReviewRun(...args);
  }

  retryProjectAIReview(...args) {
    return this.projectReviewService.retryAIReview(...args);
  }

  listProjectReviewRecords(...args) {
    return this.projectReviewService.listReviewRecords(...args);
  }

  decideProject(...args) {
    return this.projectReviewService.decideProject(...args);
  }

  resolveReportWithActions(...args) {
    return this.adminReportService.resolveReportWithActions(...args);
  }

  createSystemNotification(...args) {
    return this.adminNotificationService.createSystemNotification(...args);
  }
}

export default AdminService;
