import ApiResponse from '../../core/Response.js';
import AppError from '../../core/AppError.js';

class ProjectController {
  constructor({ projectService }) {
    this.projectService = projectService;
  }

  getOverview = async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const { type, status, q } = req.query;

      const projects = await this.projectService.getProjectsForUser(userId, {
        type,
        status,
        q
      });

      return ApiResponse.success(res, { projects });
    } catch (error) {
      next(error);
    }
  };
}

export default ProjectController;
