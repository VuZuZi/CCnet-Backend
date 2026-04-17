class AdminRepository {
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

  getSystemStats(...args) {
    return this.adminDashboardRepository.getSystemStats(...args);
  }

  findAllUsers(...args) {
    return this.adminUserRepository.findAllUsers(...args);
  }

  findUsers(...args) {
    return this.adminUserRepository.findUsers(...args);
  }

  findUserById(...args) {
    return this.adminUserRepository.findUserById(...args);
  }

  updateUser(...args) {
    return this.adminUserRepository.updateUser(...args);
  }

  updateUserCoolingPeriod(...args) {
    return this.adminUserRepository.updateUserCoolingPeriod(...args);
  }

  createAdminActionLog(...args) {
    return this.adminActionLogRepository.createAdminActionLog(...args);
  }

  findAdminActionLogs(...args) {
    return this.adminActionLogRepository.findAdminActionLogs(...args);
  }

  findOrganizerRequestActionLogs(...args) {
    return this.adminActionLogRepository.findOrganizerRequestActionLogs(...args);
  }

  findProjects(...args) {
    return this.adminProjectRepository.findProjects(...args);
  }

  findProjectsForReview(...args) {
    return this.adminProjectRepository.findProjectsForReview(...args);
  }

  findProjectById(...args) {
    return this.adminProjectRepository.findProjectById(...args);
  }

  deleteProject(...args) {
    return this.adminProjectRepository.deleteProject(...args);
  }

  findAllReports(...args) {
    return this.adminReportRepository.findAllReports(...args);
  }

  findAllPosts(...args) {
    return this.adminReportRepository.findAllPosts(...args);
  }

  findReportById(...args) {
    return this.adminReportRepository.findReportById(...args);
  }

  deletePostById(...args) {
    return this.adminReportRepository.deletePostById(...args);
  }

  saveReport(...args) {
    return this.adminReportRepository.saveReport(...args);
  }
}

export default AdminRepository;