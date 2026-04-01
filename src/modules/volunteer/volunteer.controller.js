// backend/src/modules/volunteer/volunteer.controller.js
import ApiResponse from '../../core/Response.js';

class VolunteerController {
  constructor({ volunteerService }) {
    this.volunteerService = volunteerService;
  }

  // checkApply
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

  // Apply volunteer
  applyVolunteer = async (req, res, next) => {
    try {
      //  Sửa: chỉ truyền 2 tham số
      const data = await this.volunteerService.applyVolunteer(
          req.user.userId,
          req.body
      );
      return ApiResponse.success(res, data, 'Applied successfully');
    } catch (e) {
      next(e);
    }
  };
  //restore
  restoreVolunteer = async (req, res, next) => {
    try {
      const { id } = req.params;
      //  Gọi đúng tên method trong service
      const data = await this.volunteerService.restoreVolunteer(id, req.user.userId);
      return ApiResponse.success(res, data, 'Restored successfully');
    } catch (e) {
      next(e);
    }
  };
  // UPDATE application
  updateApplication = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { skills,status, availability, motivation } = req.body;
      const data = await this.volunteerService.updateApplication(req.user.userId,id, {
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

  // Approve application
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

  // Reject application
  rejectVolunteer = async (req, res, next) => {
    try {
      const { rejectReason } = req.body;
      //  Thêm adminId
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

  //  THÊM METHOD MỚI: Get applications của project theo status
  getProjectApplications = async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const { status, limit = 20, cursor } = req.query;  // ← Lấy status từ query
      if (!projectId) {
        return ApiResponse.error(res, 'Missing projectId', 400);
      }

      // Kiểm tra projectId hợp lệ
      if (projectId.length !== 24) {
        return ApiResponse.error(res, 'Invalid project ID format', 400);
      }

      const data = await this.volunteerService.getProjectApplications(
          projectId,
          status,           // ← Truyền status vào service
          parseInt(limit),
          cursor
      );
      return ApiResponse.success(res, data, 'Project applications retrieved');
    } catch (e) {
      console.error('❌ Error in getProjectApplications:', e);
      next(e);
    }
  };

  // Get pending applications (giữ lại để tương thích)
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

      //  Gọi method getProjectApplications với status 'PENDING'
      const data = await this.volunteerService.getProjectApplications(
          projectId,
          req.params.status,
          parseInt(limit),
          cursor
      );

      return ApiResponse.success(res, data, 'Pending applications retrieved');
    } catch (e) {
      console.error('❌ Error in getProjectPendingApplications:', e);
      next(e);
    }
  };

  // Get volunteer stats
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