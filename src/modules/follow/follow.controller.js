import ApiResponse from '../../core/Response.js';
import AppError from '../../core/AppError.js';
import { idParamSchema, listFollowingSchema } from './follow.validation.js';

class FollowController {
  constructor({ followService }) {
    this.followService = followService;
  }

  followUser = async (req, res, next) => {
    try {
      const { error, value } = idParamSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);

      const followerId = req.user?.userId;
      const data = await this.followService.followUser(followerId, value.id);
      return ApiResponse.success(res, data, 'Followed');
    } catch (e) {
      next(e);
    }
  };

  unfollowUser = async (req, res, next) => {
    try {
      const { error, value } = idParamSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);

      const followerId = req.user?.userId;
      const data = await this.followService.unfollowUser(followerId, value.id);
      return ApiResponse.success(res, data, 'Unfollowed');
    } catch (e) {
      next(e);
    }
  };

  statusUser = async (req, res, next) => {
    try {
      const { error, value } = idParamSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);

      const followerId = req.user?.userId;
      const data = await this.followService.statusUser(followerId, value.id);
      return ApiResponse.success(res, data, 'Status');
    } catch (e) {
      next(e);
    }
  };

  statsUser = async (req, res, next) => {
    try {
      const { error, value } = idParamSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);

      const data = await this.followService.statsUser(value.id);
      return ApiResponse.success(res, data, 'Stats');
    } catch (e) {
      next(e);
    }
  };

  getMyFollowing = async (req, res, next) => {
    try {
      const { error, value } = listFollowingSchema.validate(req.query);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user?.userId;
      const data = await this.followService.getMyFollowing(userId, value.limit);
      return ApiResponse.success(res, data, 'Following list');
    } catch (e) {
      next(e);
    }
  };
}

export default FollowController;
