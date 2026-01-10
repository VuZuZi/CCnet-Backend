class ProjectService {
  constructor({ projectRepository }) {
    this.projectRepository = projectRepository;
  }

  async getProjectsForUser(userId, filters = {}) {
    const { type, status, q } = filters;
    
    const projects = await this.projectRepository.findWithFilters({
      userId,
      type,
      status,
      q
    });

    return projects;
  }
}

export default ProjectService;
