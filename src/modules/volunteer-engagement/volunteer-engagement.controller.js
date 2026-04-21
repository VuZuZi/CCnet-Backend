import ApiResponse from "../../core/Response.js";

class VolunteerEngagementController {
  constructor({ volunteerEngagementService }) {
    this.volunteerEngagementService = volunteerEngagementService;
  }

  bootstrapAttendance = async (req, res, next) => {
    try {
      const { projectId, milestoneId } = req.params;
      const actorId = req.user.userId;

      const result = await this.volunteerEngagementService.bootstrapAttendance(
        projectId,
        milestoneId,
        actorId
      );

      return ApiResponse.success(
        res,
        result,
        "Khởi tạo danh sách chấm công thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  getAttendanceList = async (req, res, next) => {
    try {
      const { projectId, milestoneId } = req.params;
      const actorId = req.user.userId;

      const result = await this.volunteerEngagementService.getAttendanceList(
        projectId,
        milestoneId,
        actorId
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách chấm công thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  updateAttendance = async (req, res, next) => {
    try {
      const { attendanceId } = req.params;
      const actorId = req.user.userId;

      const result = await this.volunteerEngagementService.updateAttendance(
        attendanceId,
        actorId,
        req.body
      );

      return ApiResponse.success(
        res,
        result,
        "Cập nhật chấm công thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  bootstrapReviews = async (req, res, next) => {
    try {
      const { projectId, milestoneId } = req.params;
      const actorId = req.user.userId;

      const result = await this.volunteerEngagementService.bootstrapReviews(
        projectId,
        milestoneId,
        actorId
      );

      return ApiResponse.success(
        res,
        result,
        "Khởi tạo đánh giá volunteer thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  getReviewList = async (req, res, next) => {
    try {
      const { projectId, milestoneId } = req.params;
      const actorId = req.user.userId;

      const result = await this.volunteerEngagementService.getReviewList(
        projectId,
        milestoneId,
        actorId
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách đánh giá thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  submitReview = async (req, res, next) => {
    try {
      const { reviewId } = req.params;
      const actorId = req.user.userId;

      const result = await this.volunteerEngagementService.submitReview(
        reviewId,
        actorId,
        req.body
      );

      return ApiResponse.success(
        res,
        result,
        "Đánh giá volunteer thành công"
      );
    } catch (error) {
      next(error);
    }
  };
}

export default VolunteerEngagementController;