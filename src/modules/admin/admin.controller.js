class AdminController {
  constructor({ adminService }) {
    this.adminService = adminService;
  }

  getStats = async (req, res, next) => {
    try {
      const stats = await this.adminService.getDashboardStats();
      res.json({ status: "success", data: stats });
    } catch (e) {
      next(e);
    }
  };

  getUsers = async (req, res, next) => {
    try {
      const users = await this.adminService.getUsers();
      res.json({ status: "success", data: users });
    } catch (e) {
      next(e);
    }
  };

  banUser = async (req, res, next) => {
    try {
      const { reason } = req.body;
      const user = await this.adminService.toggleUserBan(req.params.id, reason);
      res.json({ status: "success", data: user });
    } catch (e) {
      next(e);
    }
  };

  getReports = async (req, res, next) => {
    try {
      const reports = await this.adminService.getReports();
      res.json({ status: "success", data: reports });
    } catch (e) {
      next(e);
    }
  };

  resolveReport = async (req, res, next) => {
    try {
      const { actions, note } = req.body;

      const result = await this.adminService.resolveReportWithActions(
        req.params.id,
        actions || [],
        note,
      );

      res.json({ status: "success", data: result });
    } catch (e) {
      next(e);
    }
  };

  sendNotification = async (req, res, next) => {
    try {
      const notif = await this.adminService.createSystemNotification(req.body);
      res.status(201).json({ status: "success", data: notif });
    } catch (e) {
      next(e);
    }
  };

  getProjects = async (req, res, next) => {
    try {
      const projects = await this.adminService.getProjects();
      res.json({ status: "success", data: projects });
    } catch (e) {
      next(e);
    }
  };

  deleteProject = async (req, res, next) => {
    try {
      await this.adminService.deleteProject(req.params.id);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  };
}
export default AdminController;
