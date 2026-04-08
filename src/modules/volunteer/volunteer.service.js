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
  //  THÊM METHOD NÀY
  async getProjectPendingApplications(projectId, limit = 20, cursor = null) {
    // Kiểm tra project tồn tại (comment tạm thời nếu project chưa có)
    try {
      const volunteer = await this.volunteerRepository.findByProject(projectId);
      return volunteer
    } catch (error) {
      return {
        data: [],
        nextCursor: null,
        hasMore: false,
        total: 0
      };
    }
  }

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

      const existing = await this.volunteerRepository.findOne({
        volunteerId,
        opportunityId,
      });

      if (existing) {
        const status = String(existing.status || '').toUpperCase();

        if (status === 'APPROVED') {
          throw new AppError('Already approved', 400);
        }

        if (status === 'PENDING') {
          throw new AppError('Already applied', 400);
        }

        if (status === 'REJECTED') {
          await this.volunteerRepository.create({
            volunteerId,
            opportunityId,
            changerId,
            skills,
            motivation,
            availability,
          });
        }
      }

      const application =
        await this.volunteerRepository.create({
          volunteerId,
          opportunityId,
          changerId,
          skills,
          motivation,
          availability,
        });
      return application;
    } catch (e) {
      // ❗ duplicate apply
      if (e?.code === 11000) {
        const existing = await this.volunteerRepository.findOne({
          volunteerId,
          opportunityId,
        });

        if (existing) {
          const status = String(existing.status || '').toUpperCase();
          if (status === 'REJECTED') {
            await this.volunteerRepository.update(
              existing._id,
              { status: 'CANCELLED' },
              changerId || volunteerId,
            );

            const application = await this.volunteerRepository.create({
              volunteerId,
              opportunityId,
              changerId,
              skills,
              motivation,
              availability,
            });
            return application;
          }
        }

        throw new AppError('Already applied', 400);
      }
      throw e;
    }
  }
  //  UPDATE application
  async updateApplication(userId, id, updateData) { //id Project,
    // Kiểm tra application tồn tại
    const application = await this.volunteerRepository.findById(id);
    if (!application) {
      throw new AppError('Application not found', 404);
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
  async approveVolunteer(applicationId, adminId) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) {
      throw new AppError('Application not found', 404);
    }

    if (application.status !== 'PENDING') {
      throw new AppError('Can only approve pending applications', 400);
    }

    //  Sử dụng hàm update để cập nhật status
    const updated = await this.volunteerRepository.update(
      applicationId,
      { status: 'APPROVED' },  // updateData
      adminId                   // changerId
    );

    return updated;
  }
  // RESTORE
  async restoreVolunteer(applicationId, userID) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) {
      throw new AppError('Application not found', 404);
    }
    const restore = await this.volunteerRepository.update(
      applicationId,
      { status: 'PENDING' },  // updateData
      userID                   // changerId
    );
    return restore;
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

  async pendingVolunteer(applicationId, userId) {
    const application =
      await this.volunteerRepository.findById(applicationId);

    if (!application) {
      throw new AppError('Application not found', 404);
    }

    application.status = 'PENDING';
    application.changerId = userId;
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
