import AppError from "../../../core/AppError.js";

class AdminDashboardService {
  constructor({
    adminDashboardRepository,
    adminUserRepository,
    adminActionLogRepository,
    adminProjectRepository,
    adminReportRepository,
  }) {
    this.adminDashboardRepository = adminDashboardRepository;
    this.adminUserRepository = adminUserRepository;
    this.adminActionLogRepository = adminActionLogRepository;
    this.adminProjectRepository = adminProjectRepository;
    this.adminReportRepository = adminReportRepository;
  }

  async getDashboardStats() {
    return this.adminDashboardRepository.getSystemStats();
  }

  async getUsers(query = null) {
    if (query && (query.search || query.page || query.limit || query.role)) {
      return this.adminUserRepository.findUsers(query);
    }

    return this.adminUserRepository.findAllUsers();
  }

  async getActionLogs(query = {}) {
    if (!this.adminActionLogRepository?.findAdminActionLogs) {
      throw new AppError("Admin action log repository is not available.", 500);
    }

    return this.adminActionLogRepository.findAdminActionLogs(query);
  }

  async getOrganizerActionLogs(query = {}) {
    if (!this.adminActionLogRepository?.findOrganizerRequestActionLogs) {
      throw new AppError(
        "Organizer action log repository is not available.",
        500
      );
    }

    return this.adminActionLogRepository.findOrganizerRequestActionLogs(query);
  }

  async getProjects(query = {}) {
    if (typeof this.adminProjectRepository.findProjects === "function") {
      return this.adminProjectRepository.findProjects(query);
    }

    if (typeof this.adminProjectRepository.findProjectsForReview === "function") {
      return this.adminProjectRepository.findProjectsForReview({
        skip: 0,
        limit: 50,
      });
    }

    return [];
  }

  async getReports() {
    return this.adminReportRepository.findAllReports();
  }
}

export default AdminDashboardService;