import ApiResponse from '../../core/Response.js';

class FollowController {
  constructor({ followService }) {
    this.followService = followService;
  }

  followUser = async (req, res, next) => {
    try {
      const data = await this.followService.followUser(req.user.userId, req.params.id);
      return ApiResponse.success(res, data, 'Followed successfully');
    } catch (e) {
      next(e);
    }
  };

  unfollowUser = async (req, res, next) => {
    try {
      const data = await this.followService.unfollowUser(req.user.userId, req.params.id);
      return ApiResponse.success(res, data, 'Unfollowed successfully');
    } catch (e) {
      next(e);
    }
  };

  statusUser = async (req, res, next) => {
    try {
      const data = await this.followService.statusUser(req.user.userId, req.params.id);
      return ApiResponse.success(res, data, 'Status retrieved');
    } catch (e) {
      next(e);
    }
  };

  statsUser = async (req, res, next) => {
    try {
      const data = await this.followService.statsUser(req.params.id);
      return ApiResponse.success(res, data, 'Stats retrieved');
    } catch (e) {
      next(e);
    }
  };

  getMyFollowing = async (req, res, next) => {
    try {
      const { limit, cursor } = req.query;
      const data = await this.followService.getMyFollowing(req.user.userId, limit, cursor);
      return ApiResponse.success(res, data, 'Following list retrieved');
    } catch (e) {
      next(e);
    }
  };
}

export default FollowController;