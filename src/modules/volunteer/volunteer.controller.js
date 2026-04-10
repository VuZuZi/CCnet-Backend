import ApiResponse from '../../core/Response.js';

class VolunteerController {
  constructor({ volunteerService }) {
    this.volunteerService = volunteerService;
  }

  application = async (req, res, next) => {
    try {
      const data = await this.volunteerService.application(
        req.user.userId,
        req.query
      );
      return ApiResponse.success(res, data, 'Applied successfully');
    } catch (e) {
      next(e);
    }
  };

  applyVolunteer = async (req, res, next) => {
    try {
      const data = await this.volunteerService.applyVolunteer(
        req.user.userId,
        req.body
      );
      return ApiResponse.success(res, data, 'Applied successfully');
    } catch (e) {
      next(e);
    }
  };

  restoreVolunteer = async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = await this.volunteerService.restoreVolunteer(id, req.user.userId);
      return ApiResponse.success(res, data, 'Restored successfully');
    } catch (e) {
      next(e);
    }
  };

  updateApplication = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { skills, status, availability, motivation } = req.body;
      const data = await this.volunteerService.updateApplication(req.user.userId, id, {
        skills,
        status,
        availability,
        motivation
      });
      return ApiResponse.success(res, data, 'Application updated successfully');
    } catch (e) {
      next(e);
    }
  };

  cancelApplication = async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = await this.volunteerService.cancelApplication(id, req.user.userId);
      return ApiResponse.success(res, data, 'Application cancelled successfully');
    } catch (e) {
      next(e);
    }
  };

  approveVolunteer = async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = await this.volunteerService.approveVolunteer(
        id,
        req.user.userId
      );
      return ApiResponse.success(res, data, 'Approved successfully');
    } catch (e) {
      next(e);
    }
  };

  rejectVolunteer = async (req, res, next) => {
    try {
      const { rejectReason } = req.body;
      const data = await this.volunteerService.rejectVolunteer(
        req.params.id,
        req.user.userId,
        rejectReason
      );
      return ApiResponse.success(res, data, 'Rejected successfully');
    } catch (e) {
      next(e);
    }
  };

  getMyApplications = async (req, res, next) => {
    try {
      const { limit, cursor } = req.query;
      const data = await this.volunteerService.getMyApplications(
        req.user.userId,
        limit,
        cursor
      );
      return ApiResponse.success(res, data, 'Applications retrieved');
    } catch (e) {
      next(e);
    }
  };

  getMySupportedProjects = async (req, res, next) => {
    try {
      const {
        view = 'ALL',
        search = '',
        page = 1,
        limit = 12,
      } = req.query;

      const data = await this.volunteerService.getMySupportedProjects(req.user.userId, {
        view,
        search,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });

      return ApiResponse.success(res, data, 'Supported projects retrieved');
    } catch (e) {
      next(e);
    }
  };

  getProjectApplications = async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const { status, limit = 20, cursor } = req.query;

      if (!projectId) {
        return ApiResponse.error(res, 'Missing projectId', 400);
      }

      if (projectId.length !== 24) {
        return ApiResponse.error(res, 'Invalid project ID format', 400);
      }

      const data = await this.volunteerService.getProjectApplications(
        projectId,
        status,
        parseInt(limit, 10),
        cursor
      );

      return ApiResponse.success(res, data, 'Project applications retrieved');
    } catch (e) {
      console.error('❌ Error in getProjectApplications:', e);
      next(e);
    }
  };

  getProjectPendingApplications = async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const { limit = 20, cursor } = req.query;

      if (!projectId) {
        return ApiResponse.error(res, 'Missing projectId', 400);
      }

      if (projectId.length !== 24) {
        return ApiResponse.error(res, 'Invalid project ID format', 400);
      }

      const data = await this.volunteerService.getProjectPendingApplications(
        projectId,
        parseInt(limit, 10),
        cursor
      );

      return ApiResponse.success(res, data, 'Pending applications retrieved');
    } catch (e) {
      console.error('❌ Error in getProjectPendingApplications:', e);
      next(e);
    }
  };

  getStats = async (req, res, next) => {
    try {
      const data = await this.volunteerService.getStats(req.params.id);
      return ApiResponse.success(res, data, 'Stats retrieved');
    } catch (e) {
      next(e);
    }
  };
}

export default VolunteerController;