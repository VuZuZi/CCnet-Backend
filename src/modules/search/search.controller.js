import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";
import {
  globalSearchSchema,
  markCommunityPostViewedSchema,
} from "./search.validation.js";

function getCurrentUserId(req) {
  return (
    req.user?.userId || req.user?._id || req.user?.id || req.user?.sub || null
  );
}

class SearchController {
  constructor({ searchService }) {
    this.searchService = searchService;
  }

  globalSearch = async (req, res, next) => {
    try {
      const { error, value } = globalSearchSchema.validate(req.query);
      if (error) {
        throw new AppError(error.details[0].message, 400);
      }

      const userId = getCurrentUserId(req);
      if (!userId) {
        throw new AppError("Unauthorized", 401);
      }

      const data = await this.searchService.globalSearch(userId, value);
      return ApiResponse.success(res, data, "Search results");
    } catch (error) {
      next(error);
    }
  };

  markCommunityPostViewed = async (req, res, next) => {
    try {
      const { error, value } = markCommunityPostViewedSchema.validate(
        req.params,
      );
      if (error) {
        throw new AppError(error.details[0].message, 400);
      }

      const userId = getCurrentUserId(req);
      if (!userId) {
        throw new AppError("Unauthorized", 401);
      }

      const data = await this.searchService.markCommunityPostViewed(
        userId,
        value.postId,
      );

      return ApiResponse.success(res, data, "Post marked as viewed");
    } catch (error) {
      next(error);
    }
  };
}

export default SearchController;
