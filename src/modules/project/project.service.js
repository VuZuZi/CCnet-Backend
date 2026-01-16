import { v4 as uuidv4 } from 'uuid';
import AppError from '../../core/AppError.js';

class ProjectService {
  constructor({ projectRepository }) {
    this.projectRepository = projectRepository;
  }

  generateProjectId() {
    return `PRJ-${uuidv4().slice(0, 8).toUpperCase()}`;
  }

  async createProject(userId, projectData) {
    const projectId = this.generateProjectId();

    const project = await this.projectRepository.create({
      ...projectData,
      projectId,
      userId
    });

    return project;
  }

  async getProjectById(id) {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return project;
  }

  async getProjectByProjectId(projectId) {
    const project = await this.projectRepository.findByProjectId(projectId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return project;
  }

  async getProjects(filter = {}, options = {}) {
    return await this.projectRepository.findAll(filter, options);
  }

  async getProjectsByUser(userId, options = {}) {
    return await this.projectRepository.findByUserId(userId, options);
  }

  async updateProject(id, userId, updateData) {
    const project = await this.projectRepository.findById(id);
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Check if user owns this project
    if (project.userId._id.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to update this project', 403);
    }

    // Prevent updating certain fields
    const { projectId, userId: _, ...allowedUpdates } = updateData;

    const updatedProject = await this.projectRepository.update(id, allowedUpdates);
    return updatedProject;
  }

  async deleteProject(id, userId) {
    const project = await this.projectRepository.findById(id);
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Check if user owns this project
    if (project.userId._id.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to delete this project', 403);
    }

    await this.projectRepository.delete(id);
    return { deleted: true };
  }
}

export default ProjectService;
