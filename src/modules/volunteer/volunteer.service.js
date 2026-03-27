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
  // ✅ THÊM METHOD NÀY
  async getProjectPendingApplications(projectId, limit = 20, cursor = null) {
    console.log('🔍 [Service] getProjectPendingApplications called:', { projectId, limit, cursor });

    // Kiểm tra project tồn tại (comment tạm thời nếu project chưa có)
    try {
      const volunteer = await this.volunteerRepository.findByProject(projectId);
    return volunteer
    } catch (error) {
      console.log('⚠️ Project not found, returning empty list');
      return {
        data: [],
        nextCursor: null,
        hasMore: false,
        total: 0
      };
    }}

    // check volunteer của Project
  async getProjectApplications(projectId) {
    const volunteer = await this.volunteerRepository.findByProject(projectId);
    if (!volunteer) throw new AppError('volunteer not found', 404);
    return volunteer;
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
    const { opportunityId, changerId, skills, motivation, availability } = data;
    if (!opportunityId) {
      throw new AppError('Missing opportunityId', 400);
    }
    await this._ensureUserExists(volunteerId);
    await this._ensureProjectExists(opportunityId);
    try {
      console.log("volunteerId:" + volunteerId,
        "opportunityId:" + opportunityId,
        "skills:" + skills,
        "motivation:" + motivation,
        "availabilit:" + availability
      );
      console.log("aaaaaaaaaaaa");
      const application =
        await this.volunteerRepository.create({
          volunteerId,
          opportunityId,
          changerId,
          skills,
          motivation,
          availability,
        });
      console.log("aaaaaaaasaaaaa" + application);
      return application;
    } catch (e) {
      // ❗ duplicate apply
      if (e?.code === 11000) {
        throw new AppError('Already applied', 400);
      }
      throw e;
    }
  }
  // ✅ UPDATE application
  async updateApplication(id, updateData) {
    console.log('🔍 [Service] updateApplication:', { id, updateData });

    // Kiểm tra application tồn tại
    const application = await this.volunteerRepository.findById(id);
    if (!application) {
      throw new AppError('Application not found', 404);
    }

    // Chỉ cho phép update khi status là PENDING
    if (application.status !== 'PENDING') {
      throw new AppError('Cannot update application that is not pending', 400);
    }

    // Cập nhật
    const updated = await this.volunteerRepository.update(id, updateData, userId);

    return updated;
  }

  async cancelApplication(id, changerId) {
    const application = await this.volunteerRepository.findById(id);
    if (!application) {
      throw new AppError('Application not found', 404);
    }

    if (application.status !== 'PENDING') {
      throw new AppError('Cannot cancel application that is not pending', 400);
    }

    const updated = await this.volunteerRepository.update(id, {
      status: 'CANCELLED',
      changerId: changerId,
    });

    return updated;
  }


  // checkStatus
  async application(volunteerId, data) {
    try {
      //  Lấy từ data param truyền vào
      const { opportunityId } = data;
      console.log("sssssssssssssssss" + opportunityId);

      if (!opportunityId) {
        throw new AppError('Missing opportunityId', 400);
      }
      // Tìm application
      const application = await this.volunteerRepository.application({
        volunteerId,
        opportunityId
      });
      if (!application) {
        return {
          hasApplied: false,
          status: null
        };
      }
      return {
        hasApplied: true,
        id: application.id,
        status: application.status,
        role: application.role,
        skills: application.skills,
        motivation: application.motivation,
        availability: application.availability
      };
    } catch (e) {
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
      changerId: application.volunteerId,
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