import ApiResponse from "../../core/Response.js";

class VolunteerEngagementController {
  constructor({ volunteerEngagementService }) {
    this.volunteerEngagementService = volunteerEngagementService;
  }

  getProjectReviews = async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const actorId = req.user?.userId || req.user?._id || req.user?.id;

      const result = await this.volunteerEngagementService.getProjectReviews(
        projectId,
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

  getMyProjectReview = async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const actorId = req.user?.userId || req.user?._id || req.user?.id;

      const result = await this.volunteerEngagementService.getMyProjectReview(
        projectId,
        actorId
      );

      return ApiResponse.success(
        res,
        { review: result },
        "Lấy đánh giá của volunteer thành công"
      );
    } catch (error) {
      next(error);
    }
  };

  submitReview = async (req, res, next) => {
    try {
      const { reviewId } = req.params;
      const actorId = req.user?.userId || req.user?._id || req.user?.id;

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