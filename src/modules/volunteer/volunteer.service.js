import AppError from "../../core/AppError.js";
import { PROJECT_STATUS } from "../project/project.constant.js";

class VolunteerService {
  constructor({
    volunteerRepository,
    userRepository,
    projectRepository,
    jobQueue,
    conversationService,
  }) {
    this.volunteerRepository = volunteerRepository;
    this.userRepository = userRepository;
    this.projectRepository = projectRepository;
    this.jobQueue = jobQueue;
    this.conversationService = conversationService;
  }

  async _ensureUserExists(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  async _ensureProjectExists(projectId) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new AppError("Project not found", 404);
    return project;
  }

  async _ensureActorCanReviewProject(actorId, project) {
    const actor = await this._ensureUserExists(actorId);
    const actorRole = String(actor?.role || "").toLowerCase();
    const isAdmin = actorRole === "admin";
    const isProjectOwner =
      String(project?.organizerId || "") === String(actorId);

    if (!isAdmin && !isProjectOwner) {
      throw new AppError("You do not have permission to review this application", 403);
    }

    return actor;
  }

  _shouldSyncProjectConversation(status) {
    return [
      PROJECT_STATUS.FUNDING,
      PROJECT_STATUS.RECRUITING,
      PROJECT_STATUS.ACTIVE,
      PROJECT_STATUS.EXECUTING,
    ].includes(String(status));
  }

  async _syncApprovedVolunteerToProjectConversation({
    project,
    volunteerId,
    actorId,
  }) {
    if (!project || !volunteerId) return null;
    if (!this.conversationService) return null;
    if (!this._shouldSyncProjectConversation(project.status)) return null;

    return this.conversationService.syncApprovedVolunteerToProjectConversation({
      projectId: project._id,
      organizerId: project.organizerId,
      volunteerId,
      groupName: project.title,
      actorId,
    });
  }

  async applyVolunteer(volunteerId, data) {
    const { opportunityId, changerId, skills, motivation, availability } = data;

    if (!opportunityId) {
      throw new AppError("Missing opportunityId", 400);
    }

    await this._ensureUserExists(volunteerId);
    const project = await this._ensureProjectExists(opportunityId);

    if (!project.needsVolunteers) {
      throw new AppError("This project is not recruiting volunteers", 400);
    }

    if (project.isVolunteerFull) {
      throw new AppError("This project has reached the volunteer limit", 400);
    }

    try {
      const application = await this.volunteerRepository.create({
        volunteerId,
        opportunityId,
        changerId,
        skills,
        motivation,
        availability,
      });

      return application;
    } catch (e) {
      if (e?.code === 11000) {
        throw new AppError("Already applied", 400);
      }
      throw e;
    }
  }

  async updateApplication(userId, id, updateData) {
    const application = await this.volunteerRepository.findById(id);
    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (String(application.volunteerId) !== String(userId)) {
      throw new AppError("You do not have permission to update this application", 403);
    }

    if (application.status !== "PENDING") {
      throw new AppError("Only pending applications can be updated", 400);
    }

    const updated = await this.volunteerRepository.update(id, updateData, userId);
    return updated;
  }

  async cancelApplication(id, changerId) {
    const application = await this.volunteerRepository.findById(id);
    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (String(application.volunteerId) !== String(changerId)) {
      throw new AppError("You do not have permission to cancel this application", 403);
    }

    if (application.status !== "PENDING") {
      throw new AppError("Cannot cancel application that is not pending", 400);
    }

    const updated = await this.volunteerRepository.update(
      id,
      { status: "CANCELLED" },
      changerId
    );

    return updated;
  }

  async application(volunteerId, data) {
    const { opportunityId } = data;

    if (!opportunityId) {
      throw new AppError("Missing opportunityId", 400);
    }

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
  }

  async approveVolunteer(applicationId, actorId) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "PENDING") {
      throw new AppError("Can only approve pending applications", 400);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    await this._ensureActorCanReviewProject(actorId, project);

    if (!project.needsVolunteers) {
      throw new AppError("This project is not recruiting volunteers", 400);
    }

    if (project.isVolunteerFull) {
      throw new AppError("This project has reached the volunteer limit", 400);
    }

    const updated = await this.volunteerRepository.update(
      applicationId,
      { status: "APPROVED", rejectReason: null },
      actorId
    );

    await this.projectRepository.incrementProjectStats(
      project._id,
      { "stats.currentVolunteers": 1 }
    );

    await this._syncApprovedVolunteerToProjectConversation({
      project,
      volunteerId: application.volunteerId,
      actorId,
    });

    return updated;
  }

  async restoreVolunteer(applicationId, userId) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) {
      throw new AppError("Application not found", 404);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    await this._ensureActorCanReviewProject(userId, project);

    const restored = await this.volunteerRepository.update(
      applicationId,
      { status: "PENDING" },
      userId
    );

    return restored;
  }

  async rejectVolunteer(applicationId, actorId, rejectReason) {
    const application = await this.volunteerRepository.findById(applicationId);

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "PENDING") {
      throw new AppError("Can only reject pending applications", 400);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    await this._ensureActorCanReviewProject(actorId, project);

    const updated = await this.volunteerRepository.update(
      applicationId,
      {
        status: "REJECTED",
        rejectReason: String(rejectReason || "").trim() || null,
      },
      actorId
    );

    return updated;
  }

  async pendingVolunteer(applicationId, userId) {
    const application = await this.volunteerRepository.findById(applicationId);

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    await this._ensureActorCanReviewProject(userId, project);

    const updated = await this.volunteerRepository.update(
      applicationId,
      { status: "PENDING" },
      userId
    );

    return updated;
  }

  async getMyApplications(userId, limit = 10, cursor = null) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    const applications = await this.volunteerRepository.findByUser(
      userId,
      normalizedLimit,
      cursor
    );

    const nextCursor =
      applications.length === normalizedLimit
        ? applications[applications.length - 1]._id
        : null;

    return {
      data: applications,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  async getMySupportedProjects(userId, filters = {}) {
    const {
      view = 'ALL',
      search = '',
      page = 1,
      limit = 12,
    } = filters;

    const applications = await this.volunteerRepository.findByUserWithProject(userId);

    const normalizedSearch = String(search || "").trim().toLowerCase();

    const items = applications
      .map((application) => {
        const project = application.opportunityId || null;
        const isApproved = application.status === 'APPROVED';

        const derivedStatus = !project
          ? application.status
          : application.status === 'PENDING'
            ? 'PENDING'
            : application.status === 'REJECTED'
              ? 'REJECTED'
              : application.status === 'CANCELLED'
                ? 'CANCELLED'
                : project.status === 'IN_PROGRESS'
                  ? 'IN_PROGRESS'
                  : project.status === 'COMPLETED'
                    ? 'COMPLETED'
                    : isApproved
                      ? 'JOINED'
                      : application.status;

        return {
          applicationId: String(application._id),
          applicationStatus: application.status,
          appliedAt: application.appliedAt || application.createdAt,
          rejectReason: application.rejectReason || null,
          reason: application.reason || null,
          derivedStatus,
          project: project
            ? {
                id: String(project._id),
                title: project.title,
                coverMedia: project.coverMedia || null,
                category: project.category,
                targetAmount: project.targetAmount || 0,
                currentAmount: project.currentAmount || 0,
                location: project.location || null,
                status: project.status,
                organizer: project.organizerId || null,
                startDate: project.startDate || null,
                endDate: project.endDate || null,
                stats: project.stats || null,
              }
            : null,
        };
      })
      .filter((item) => {
        const matchesSearch =
          !normalizedSearch ||
          item.project?.title?.toLowerCase().includes(normalizedSearch) ||
          item.project?.category?.toLowerCase().includes(normalizedSearch) ||
          item.project?.location?.address?.toLowerCase().includes(normalizedSearch);

        if (!matchesSearch) {
          return false;
        }

        switch (view) {
          case 'JOINED':
            return item.applicationStatus === 'APPROVED';
          case 'IN_PROGRESS':
            return (
              item.applicationStatus === 'APPROVED' &&
              item.project?.status === 'IN_PROGRESS'
            );
          case 'COMPLETED':
            return (
              item.applicationStatus === 'APPROVED' &&
              item.project?.status === 'COMPLETED'
            );
          case 'PENDING':
            return item.applicationStatus === 'PENDING';
          case 'REJECTED':
            return item.applicationStatus === 'REJECTED';
          case 'CANCELLED':
            return item.applicationStatus === 'CANCELLED';
          default:
            return true;
        }
      });

    const total = items.length;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 12);
    const start = (safePage - 1) * safeLimit;
    const data = items.slice(start, start + safeLimit);

    const summary = {
      totalApplications: applications.length,
      totalSupported: applications.filter((item) => item.status === 'APPROVED').length,
      joined: applications.filter((item) => item.status === 'APPROVED').length,
      inProgress: applications.filter(
        (item) =>
          item.status === 'APPROVED' &&
          item.opportunityId?.status === 'IN_PROGRESS'
      ).length,
      completed: applications.filter(
        (item) =>
          item.status === 'APPROVED' &&
          item.opportunityId?.status === 'COMPLETED'
      ).length,
      pending: applications.filter((item) => item.status === 'PENDING').length,
      rejected: applications.filter((item) => item.status === 'REJECTED').length,
      cancelled: applications.filter((item) => item.status === 'CANCELLED').length,
    };

    return {
      data,
      summary,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        hasNext: start + safeLimit < total,
        hasPrev: safePage > 1,
      },
      filters: {
        view,
        search,
      },
    };
  }

  async getProjectPendingApplications(projectId, limit = 20, cursor = null) {
    await this._ensureProjectExists(projectId);

    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    const applications = await this.volunteerRepository.findByProject(
      projectId,
      "PENDING",
      normalizedLimit,
      cursor
    );

    const nextCursor =
      applications.length === normalizedLimit
        ? applications[applications.length - 1]._id
        : null;

    return {
      data: applications,
      nextCursor,
      hasMore: !!nextCursor,
      total: applications.length,
    };
  }

  async getProjectApplications(projectId, status = null, limit = 10, cursor = null) {
    await this._ensureProjectExists(projectId);

    const normalizedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    const applications = await this.volunteerRepository.findByProject(
      projectId,
      status,
      normalizedLimit,
      cursor
    );

    const nextCursor =
      applications.length === normalizedLimit
        ? applications[applications.length - 1]._id
        : null;

    return {
      data: applications,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  async getStats(userId) {
    const count = await this.volunteerRepository.countByUser(userId);

    return {
      totalApplications: count,
    };
  }
}

export default VolunteerService;