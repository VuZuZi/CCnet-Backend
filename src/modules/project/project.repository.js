import Project from './project.model.js';

class ProjectRepository {
  async create(projectData) {
    const project = new Project(projectData);
    await project.save();
    return project;
  }

  async findById(id) {
    return await Project.findById(id).populate('userId', 'fullName email avatar');
  }

  async findByProjectId(projectId) {
    return await Project.findOne({ projectId }).populate('userId', 'fullName email avatar');
  }

  async findAll(filter = {}, options = {}) {
    const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const projects = await Project.find(filter)
      .populate('userId', 'fullName email avatar')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Project.countDocuments(filter);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findByUserId(userId, options = {}) {
    const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const projects = await Project.find({ userId })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Project.countDocuments({ userId });

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async update(id, updateData) {
    return await Project.findByIdAndUpdate(id, updateData, { new: true })
      .populate('userId', 'fullName email avatar');
  }

  async delete(id) {
    return await Project.findByIdAndDelete(id);
  }

  async countByUserId(userId) {
    return await Project.countDocuments({ userId });
  }

  async countByStatus(status) {
    return await Project.countDocuments({ status });
  }
}

export default ProjectRepository;
