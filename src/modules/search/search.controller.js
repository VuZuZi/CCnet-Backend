import ApiResponse from '../../core/Response.js';
import AppError from '../../core/AppError.js';
import { globalSearchSchema } from './search.validation.js';

class SearchController {
  constructor({ searchService }) {
    this.searchService = searchService;
  }

  globalSearch = async (req, res, next) => {
    try {
      const { error, value } = globalSearchSchema.validate(req.query);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const data = await this.searchService.globalSearch(userId, value.q, value.limit);
      return ApiResponse.success(res, data, 'Search results');
    } catch (err) {
      next(err);
    }
  };
}

export default SearchController;
