import ApiResponse from '../../core/Response.js';

class VolunteerController {
  constructor({ volunteerService }) {
    this.volunteerService = volunteerService;
  }

  // Apply volunteer
  applyVolunteer = async (req, res, next) => {
    console.log('🎯 [Controller] applyVolunteer called');

    try {
      const data = await this.volunteerService.applyVolunteer(
        req.user.userId,
        req.params.projectId,
        req.body
      );
      return ApiResponse.success(res, data, 'Applied successfully');
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
  getProjectApplications = async (req, res, next) => {
    try {
      const { limit, cursor } = req.query;

      const data = await this.volunteerService.getProjectApplications(
        req.params.opportunityId,
        limit,
        cursor
      );

      return ApiResponse.success(res, data, 'Project applications retrieved');
    } catch (e) {
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

export default VolunteerController = {
  applyVolunteer: async (req, res) => {
    try {
      console.log('🔍 [Controller] Request body:', req.body);
      console.log('🔍 [Controller] Request user:', req.user);

      // ✅ Tạo data object từ req.body và req.user
      const data = {
        opportunityId: req.body.opportunityId,
        volunteerId: req.user?.id,  // Lấy từ token
        skills: req.body.skills,
        motivation: req.body.motivation,
        availability: req.body.availability
      };

      console.log('📦 [Controller] Data to service:', data);

      // ✅ Kiểm tra data có đầy đủ không
      if (!data.opportunityId) {
        return res.status(400).json({
          success: false,
          message: 'opportunityId is required'
        });
      }

      if (!data.volunteerId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // ✅ Gọi service với data
      const result = await volunteerService.applyVolunteer(data);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Đăng ký thành công'
      });
    } catch (error) {
      console.error('❌ [Controller] Error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};