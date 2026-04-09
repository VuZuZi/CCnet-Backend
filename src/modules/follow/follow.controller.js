import ApiResponse from "../../core/Response.js";

class FollowController {
  constructor({ followService }) {
    this.followService = followService;
  }

  followUser = async (req, res, next) => {
    try {
      const data = await this.followService.followUser(
        req.user.userId,
        req.params.id,
      );
      return ApiResponse.success(res, data, "Followed successfully");
    } catch (e) {
      next(e);
    }
  };

  unfollowUser = async (req, res, next) => {
    try {
      const data = await this.followService.unfollowUser(
        req.user.userId,
        req.params.id,
      );
      return ApiResponse.success(res, data, "Unfollowed successfully");
    } catch (e) {
      next(e);
    }
  };

  statusUser = async (req, res, next) => {
    try {
      const data = await this.followService.statusUser(
        req.user.userId,
        req.params.id,
      );
      return ApiResponse.success(res, data, "Status retrieved");
    } catch (e) {
      next(e);
    }
  };

  statsUser = async (req, res, next) => {
    try {
      const data = await this.followService.statsUser(req.params.id);
      return ApiResponse.success(res, data, "Stats retrieved");
    } catch (e) {
      next(e);
    }
  };

  getMyFollowing = async (req, res, next) => {
    try {
      const type = req.query.type || "user";
      // 1. Ở đây biến tên là "limit"
      const limit = parseInt(req.query.limit, 10) || 50;
      const cursor = req.query.cursor;

      console.log(
        `🔥 [BACKEND LOG] Đang gọi API lấy danh sách cho Tab: ${type.toUpperCase()}`,
      );

      const data = await this.followService.getMyFollowing(
        req.user.userId,
        limit, // 🚨 2. SỬA LẠI CHỖ NÀY THÀNH "limit" (Xóa chữ normalizedLimit đi)
        cursor,
        type,
      );

      return ApiResponse.success(res, data, "Following list retrieved");
    } catch (e) {
      next(e);
    }
  };

  getMyFollowers = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const userId = req.user.userId;
      const followers = await this.followService.getFollowers({
        userId,
        limit,
      });

      return ApiResponse.success(res, followers);
    } catch (error) {
      next(error);
    }
  };

  toggleProjectFollow = async (req, res, next) => {
    try {
      const data = await this.followService.toggleProjectFollow(
        req.user.userId,
        req.params.projectId,
      );
      const message = data.isFollowing
        ? "Followed project successfully"
        : "Unfollowed project successfully";
      return ApiResponse.success(res, data, message);
    } catch (e) {
      next(e);
    }
  };
}

export default FollowController;
