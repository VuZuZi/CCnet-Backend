import AppError from '../../core/AppError.js';

class VolunteerService {
  constructor({
    volunteerRepository,
    userRepository,
    projectRepository,
    jobQueue,
  }) {
    this.volunteerRepository = volunteerRepository;
    this.userRepository = userRepository;
    this.projectRepository = projectRepository;
    this.jobQueue = jobQueue;
  }

  // check user tồn tại
  async _ensureUserExists(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  // check project tồn tại
  async _ensureProjectExists(projectId) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new AppError('Project not found', 404);
    return project;
  }

  // APPLY VOLUNTEER
  async applyVolunteer(volunteerId, data) {
    const { opportunityId, skills, motivation, availability } = data;

    if (!opportunityId) {
      throw new AppError('Missing opportunityId', 400);
    }

    await this._ensureUserExists(volunteerId);
    await this._ensureProjectExists(opportunityId);

    try {
      const application =
        await this.volunteerRepository.create({
          volunteerId,
          opportunityId,
          skills,
          motivation,
          availability,
        });

      return application;
    } catch (e) {
      // ❗ duplicate apply
      if (e?.code === 11000) {
        throw new AppError('Already applied', 400);
      }
      throw e;
    }
  }

  // APPROVE
  async approveVolunteer(applicationId) {
    const application =
      await this.volunteerRepository.findById(applicationId);

    if (!application) {
      throw new AppError('Application not found', 404);
    }

    application.status = 'APPROVED';
    await application.save();

    // tạo volunteer chính thức
    await this.volunteerRepository.create({
      volunteerId: application.volunteerId,
      opportunityId: application.opportunityId,
    });

    // enqueue job (optional)
    try {
      await this.jobQueue.addJob('volunteer', 'approved', {
        volunteerId: application.volunteerId,
      });
    } catch (e) {
      console.error('[VolunteerService] Queue error:', e.message);
    }

    return application;
  }

  // REJECT
  async rejectVolunteer(applicationId, rejectReason) {
    const application =
      await this.volunteerRepository.findById(applicationId);

    if (!application) {
      throw new AppError('Application not found', 404);
    }

    application.status = 'REJECTED';
    application.rejectReason = rejectReason;

    await application.save();

    return application;
  }

  // GET MY APPLICATIONS
  async getMyApplications(userId, limit = 10, cursor) {
    const applications =
      await this.volunteerRepository.findByUser(
        userId,
        limit,
        cursor
      );

    const nextCursor =
      applications.length === limit
        ? applications[applications.length - 1]._id
        : null;

    return {
      data: applications,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  // GET PROJECT APPLICATIONS
  async getProjectApplications(projectId, limit = 10, cursor) {
    await this._ensureProjectExists(projectId);

    const applications =
      await this.volunteerRepository.findByProject(
        projectId,
        limit,
        cursor
      );

    const nextCursor =
      applications.length === limit
        ? applications[applications.length - 1]._id
        : null;

    return {
      data: applications,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  // STATS
  async getStats(userId) {
    const count =
      await this.volunteerRepository.countByUser(userId);

    return {
      totalApplications: count,
    };
  }
}

export default VolunteerService;