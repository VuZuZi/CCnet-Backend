import ApiResponse from '../../core/Response.js';
import AppError from '../../core/AppError.js';
import {
  createProjectSchema,
  updateProjectSchema,
  getProjectsSchema
} from './project.validation.js';

class ProjectController {
  constructor({ projectService }) {
    this.projectService = projectService;
  }

  createProject = async (req, res, next) => {
    try {
      const { error, value } = createProjectSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user.userId;
      const project = await this.projectService.createProject(userId, value);

      return ApiResponse.created(res, project, 'Project created successfully');
    } catch (error) {
      next(error);
    }
  };

  getProjects = async (req, res, next) => {
    try {
      const { error, value } = getProjectsSchema.validate(req.query);
      if (error) throw new AppError(error.details[0].message, 400);

      const { page, limit, status, sortBy, sortOrder } = value;

      const filter = {};
      if (status) filter.status = status;

      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const result = await this.projectService.getProjects(filter, { page, limit, sort });

      return ApiResponse.success(res, result, 'Projects retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  getProjectById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const project = await this.projectService.getProjectById(id);

      return ApiResponse.success(res, project, 'Project retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  getMyProjects = async (req, res, next) => {
    try {
      const { error, value } = getProjectsSchema.validate(req.query);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user.userId;
      const { page, limit, sortBy, sortOrder } = value;
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const result = await this.projectService.getProjectsByUser(userId, { page, limit, sort });

      return ApiResponse.success(res, result, 'Your projects retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  updateProject = async (req, res, next) => {
    try {
      const { error, value } = updateProjectSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const { id } = req.params;
      const userId = req.user.userId;

      const project = await this.projectService.updateProject(id, userId, value);

      return ApiResponse.success(res, project, 'Project updated successfully');
    } catch (error) {
      next(error);
    }
  };

  deleteProject = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      await this.projectService.deleteProject(id, userId);

      return ApiResponse.success(res, null, 'Project deleted successfully');
    } catch (error) {
      next(error);
    }
  };
}

export default ProjectController;
