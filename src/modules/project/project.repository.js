import Project from './project.model.js';

class ProjectRepository {
  async findWithFilters({ userId, type, status, q }) {
    const query = {};

    // Filter by type (owned / joined)
    if (type === 'owned') {
      query.userId = userId;
    } else if (type === 'joined') {
      query.participants = userId;
    } else {
      // all: owned OR joined
      query.$or = [
        { userId: userId },
        { participants: userId }
      ];
    }

    // Filter by status
    if (status && ['ongoing', 'completed'].includes(status)) {
      query.status = status;
    }

    // Search by title (case-insensitive)
    if (q && q.trim()) {
      query.title = { $regex: q.trim(), $options: 'i' };
    }

    return await Project.find(query).sort({ created_at: -1 });
  }

  async findById(id) {
    return await Project.findById(id);
  }

  async findByProjectId(projectId) {
    return await Project.findOne({ projectId: projectId });
  }
}

export default ProjectRepository;
