import ApiResponse from '../../core/Response.js';

class VolunteerController {
  constructor({ volunteerService }) {
    this.volunteerService = volunteerService;
  }
  // checkApply
  application = async (req, res, next) => {
    console.log('🎯 [Controller] application called' + req.user.userId);
    console.log('🎯 [Controller] application called' + req.body);
    console.log('📥 req.query:', req.query);  // ← Thêm dòng này để debug
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
  // Apply volunteer
  applyVolunteer = async (req, res, next) => {
    console.log('🎯 [Controller] applyVolunteer called');

    try {
      const data = await this.volunteerService.applyVolunteer(
        req.user.userId,
        req.body, req.user.userId
      );
      return ApiResponse.success(res, data, 'Applied successfully');
    } catch (e) {
      next(e);
    }
  };
  // UPDATE application
  updateApplication = async (req, res, next) => {
    console.log('🎯 [Controller] UPDATE application called');

    try {
      const { id } = req.params;
      const { skills, availability, motivation } = req.body;

      const data = await this.volunteerService.updateApplication(id, {
        skills,
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
  // Approve application
  approveVolunteer = async (req, res, next) => {
    try {
      const data = await this.volunteerService.approveVolunteer(
        req.params.id
      );

      return ApiResponse.success(res, data, 'Approved successfully');
    } catch (e) {
      next(e);
    }
  };

  // Reject application
  rejectVolunteer = async (req, res, next) => {
    try {
      const { rejectReason } = req.body;

      const data = await this.volunteerService.rejectVolunteer(
        req.params.id,
        rejectReason
      );

      return ApiResponse.success(res, data, 'Rejected successfully');
    } catch (e) {
      next(e);
    }
  };

  // Get my applications
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

  // Get applications of a project
  getProjectPendingApplications = async (req, res, next) => {
    console.log('🎯 [Controller] getProjectPendingApplications called');
    console.log('📥 projectId:', req.params.projectId);

    try {
      const { projectId } = req.params;

      if (!projectId) {
        return ApiResponse.error(res, 'Missing projectId', 400);
      }

      // Kiểm tra projectId có hợp lệ không
      if (projectId.length !== 24) {
        console.error('❌ Invalid projectId format:', projectId);
        return ApiResponse.error(res, 'Invalid project ID format', 400);
      }
      console.log('📥 projessssssctId:', req.params.projectId);

      const data = await this.volunteerService.getProjectPendingApplications(
          projectId,
          parseInt(req.query.limit) || 20,
          req.query.cursor
      );
      console.log('📥 projessssssaasctId:', data);

      return ApiResponse.success(res, data, 'Pending applications retrieved');
    } catch (e) {
      console.error('❌ Error in getProjectPendingApplications:', e);
      next(e);
    }
  };

  // Get volunteer stats
  getStats = async (req, res, next) => {
    try {
      const data = await this.volunteerService.getStats(
        req.params.id
      );

      return ApiResponse.success(res, data, 'Stats retrieved');
    } catch (e) {
      next(e);
    }
  };
}

export default VolunteerController;