class AdminService {
  constructor({
    adminDashboardService,
    adminUserService,
    adminProjectService,
    adminReportService,
    adminNotificationService,
  }) {
    this.adminDashboardService = adminDashboardService;
    this.adminUserService = adminUserService;
    this.adminProjectService = adminProjectService;
    this.adminReportService = adminReportService;
    this.adminNotificationService = adminNotificationService;
  }

  getDashboardStats(...args) {
    return this.adminDashboardService.getDashboardStats(...args);
  }

  getUsers(...args) {
    return this.adminDashboardService.getUsers(...args);
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

  getReports(...args) {
    return this.adminDashboardService.getReports(...args);
  }

  toggleUserBan(...args) {
    return this.adminUserService.toggleUserBan(...args);
  }

  updateUserStatus(...args) {
    return this.adminUserService.updateUserStatus(...args);
  }

  updateProjectStatus(...args) {
    return this.adminProjectService.updateProjectStatus(...args);
  }

  deleteProject(...args) {
    return this.adminProjectService.deleteProject(...args);
  }

  resolveReportWithActions(...args) {
    return this.adminReportService.resolveReportWithActions(...args);
  }

  createSystemNotification(...args) {
    return this.adminNotificationService.createSystemNotification(...args);
  }
}

export default AdminService;