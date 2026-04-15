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
      const hasQueryParams =
        req.query?.search ||
        req.query?.page ||
        req.query?.limit ||
        req.query?.role;

      const users = hasQueryParams
        ? await this.adminService.getUsers(req.query)
        : await this.adminService.getUsers();

      res.json({ status: "success", data: users });
    } catch (e) {
      next(e);
    }
  };

  banUser = async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      const user = await this.adminService.toggleUserBan(
        req.params.id,
        reason,
        req.user?.userId || req.user?._id || null,
        req.user?.role || "admin"
      );
      res.json({ status: "success", data: user });
    } catch (e) {
      next(e);
    }
  };

  /*
  Disabled by team request: no more Verify / Verified feature in UI
  verifyUser = async (req, res, next) => {
    try {
      const { isVerified, reason } = req.body || {};
      const user = await this.adminService.verifyUser(
        req.params.id,
        isVerified,
        reason,
        req.user?.userId || req.user?._id || null,
        req.user?.role || "admin"
      );
      res.json({ status: "success", data: user });
    } catch (e) {
      next(e);
    }
  };
  */

  updateUserStatus = async (req, res, next) => {
    try {
      const { status, reason } = req.body || {};
      const user = await this.adminService.updateUserStatus(
        req.params.id,
        status,
        reason,
        req.user?.userId || req.user?._id || null,
        req.user?.role || "admin"
      );
      res.json({ status: "success", data: user });
    } catch (e) {
      next(e);
    }
  };

  getActionLogs = async (req, res, next) => {
    try {
      const logs = await this.adminService.getActionLogs(req.query || {});
      res.json({ status: "success", data: logs });
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
      const { actions, note } = req.body || {};
      const result = await this.adminService.resolveReportWithActions(
        req.params.id,
        Array.isArray(actions) ? actions : [],
        note
      );

      res.json({ status: "success", data: result });
    } catch (e) {
      next(e);
    }
  };

  sendNotification = async (req, res, next) => {
    try {
      const currentRole = String(req.user?.role || "").toLowerCase();

      if (currentRole !== "admin") {
        return res.status(403).json({
          status: "error",
          message: "Only admin can create system notifications.",
        });
      }

      const notif = await this.adminService.createSystemNotification({
        ...req.body,
        actorId: req.user?.userId || req.user?._id || null,
        actorRole: currentRole,
      });

      res.status(201).json({ status: "success", data: notif });
    } catch (e) {
      next(e);
    }
  };

  getProjects = async (req, res, next) => {
    try {
      const projects = await this.adminService.getProjects(req.query || {});
      res.json({ status: "success", data: projects });
    } catch (e) {
      next(e);
    }
  };

  updateProjectStatus = async (req, res, next) => {
    try {
      const { status, feedback, reason } = req.body || {};

      const updated = await this.adminService.updateProjectStatus(
        req.params.id,
        status,
        reason || feedback || "",
        req.user?.userId || req.user?._id || null
      );

      res.json({ status: "success", data: updated });
    } catch (e) {
      next(e);
    }
  };

  deleteProject = async (req, res, next) => {
    try {
      const { reason } = req.body || {};

      await this.adminService.deleteProject(
        req.params.id,
        reason,
        req.user?.userId || req.user?._id || null
      );

      res.status(204).send();
    } catch (e) {
      next(e);
    }
  };
}

export default AdminController;