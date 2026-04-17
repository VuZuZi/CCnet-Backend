import AppError from "../../core/AppError.js";
import { PROJECT_STATUS } from "../project/project.constant.js";
import { NOTIFICATION_TYPES } from "../notification/constants/notification.constants.js";

const EXECUTING_LIKE_STATUSES = [
  PROJECT_STATUS.EXECUTING,
  PROJECT_STATUS.ACTIVE,
  PROJECT_STATUS.PAUSED,
];

const COMPLETED_LIKE_STATUSES = [
  PROJECT_STATUS.COMPLETED,
  PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
  PROJECT_STATUS.COMPLETED_PARTIAL,
];

class VolunteerService {
  constructor({
    volunteerRepository,
    userRepository,
    projectRepository,
    transactionManager = null,
    jobQueue = null,
    conversationService = null,
    notificationService = null,
  }) {
    this.volunteerRepository = volunteerRepository;
    this.userRepository = userRepository;
    this.projectRepository = projectRepository;
    this.transactionManager = transactionManager;
    this.jobQueue = jobQueue;
    this.conversationService = conversationService;
    this.notificationService = notificationService;
  }

  async _ensureUserExists(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  async _ensureProjectExists(projectId, session = null) {
    const project = await this.projectRepository.findById(projectId, session);
    if (!project) throw new AppError("Project not found", 404);
    return project;
  }

  async _ensureActorCanReviewProject(actorId, project) {
    const actor = await this._ensureUserExists(actorId);
    const actorRole = String(actor?.role || "").toLowerCase();
    const isAdmin = actorRole === "admin";
    const isProjectOwner = String(project?.organizerId || "") === String(actorId);

    if (!isAdmin && !isProjectOwner) {
      throw new AppError(
        "You do not have permission to review this application",
        403
      );
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

  _buildOrganizerWithdrawActionUrl(projectId, applicationId) {
    const safeProjectId = String(projectId || "").trim();
    const safeApplicationId = String(applicationId || "").trim();

    return `/projects/${safeProjectId}?tab=volunteer&subTab=withdraw${
      safeApplicationId
        ? `&applicationId=${encodeURIComponent(safeApplicationId)}`
        : ""
    }`;
  }

  _buildVolunteerApplicationActionUrl(projectId, applicationId) {
    const safeProjectId = String(projectId || "").trim();
    const safeApplicationId = String(applicationId || "").trim();

    return `/projects/${safeProjectId}?tab=volunteer${
      safeApplicationId
        ? `&applicationId=${encodeURIComponent(safeApplicationId)}`
        : ""
    }`;
  }

  _buildOrganizerApplicationActionUrl(projectId, applicationId) {
    const safeProjectId = String(projectId || "").trim();
    const safeApplicationId = String(applicationId || "").trim();

    return `/projects/${safeProjectId}?tab=volunteer&subTab=applications${
      safeApplicationId
        ? `&applicationId=${encodeURIComponent(safeApplicationId)}`
        : ""
    }`;
  }

  async _syncVolunteerOnlyProjectExecutionStatus(projectId, session = null) {
    if (
      !projectId ||
      !this.projectRepository ||
      typeof this.projectRepository.syncVolunteerOnlyExecutionStatus !== "function"
    ) {
      return null;
    }

    try {
      return await this.projectRepository.syncVolunteerOnlyExecutionStatus(projectId, session);
    } catch (error) {
      console.error(
        "❌ [VolunteerService] syncVolunteerOnlyProjectExecutionStatus error:",
        error
      );
      return null;
    }
  }

  async _getFreshProjectAfterVolunteerSync(projectId, session = null) {
    const syncedProject = await this._syncVolunteerOnlyProjectExecutionStatus(projectId, session);
    if (syncedProject) return syncedProject;
    return this._ensureProjectExists(projectId, session);
  }

  async _syncApprovedVolunteerToProjectConversation({
    project,
    volunteerId,
    actorId,
  }) {
    if (!project || !volunteerId) return null;
    if (!this.conversationService) return null;
    if (!this._shouldSyncProjectConversation(project.status)) return null;

    try {
      return await this.conversationService.syncApprovedVolunteerToProjectConversation({
        projectId: project._id,
        organizerId: project.organizerId,
        volunteerId,
        groupName: project.title,
        actorId,
      });
    } catch (error) {
      console.error(
        "❌ [VolunteerService] syncApprovedVolunteerToProjectConversation error:",
        error
      );
      return null;
    }
  }

  async _removeVolunteerFromProjectConversation({
    project,
    volunteerId,
    actorId,
  }) {
    if (!project || !volunteerId) return null;
    if (!this.conversationService) return null;

    if (
      typeof this.conversationService.removeMemberFromProjectConversation !== "function"
    ) {
      return null;
    }

    try {
      return await this.conversationService.removeMemberFromProjectConversation({
        projectId: project._id,
        participantId: volunteerId,
        actorId,
      });
    } catch (error) {
      console.error(
        "❌ [VolunteerService] removeVolunteerFromProjectConversation error:",
        error
      );
      return null;
    }
  }

  async _safeCreateNotification(payload) {
    if (!this.notificationService) return null;

    try {
      return await this.notificationService.createNotification(payload);
    } catch (error) {
      console.error("❌ [VolunteerService] createNotification error:", error);
      return null;
    }
  }

  async _notifyOrganizerVolunteerApplied({ project, application, volunteer }) {
    if (!project?.organizerId) return null;

    return this._safeCreateNotification({
      recipientId: project.organizerId,
      actorId: volunteer?._id || volunteer?.id || application?.volunteerId,
      type: NOTIFICATION_TYPES.VOLUNTEER_APPLIED,
      title: "Có đơn đăng ký tình nguyện mới",
      message: `${volunteer?.fullName || "Một tình nguyện viên"} đã đăng ký tham gia dự án "${project?.title || ""}".`,
      actionUrl: this._buildOrganizerApplicationActionUrl(
        project?._id,
        application?._id
      ),
      entityType: "project",
      entityId: String(project?._id || ""),
      metadata: {
        projectId: String(project?._id || ""),
        projectName: project?.title || null,
        volunteerId: String(application?.volunteerId || ""),
        applicationId: String(application?._id || ""),
      },
    });
  }

  async _notifyVolunteerApplicationApproved({ project, application, actor }) {
    return this._safeCreateNotification({
      recipientId: application.volunteerId,
      actorId: actor?._id || actor?.id || null,
      type: NOTIFICATION_TYPES.VOLUNTEER_APPLICATION_APPROVED,
      title: "Đơn đăng ký tình nguyện đã được chấp nhận",
      message: `Đơn đăng ký của bạn cho dự án "${project?.title || ""}" đã được chấp nhận.`,
      actionUrl: this._buildVolunteerApplicationActionUrl(
        project?._id,
        application?._id
      ),
      entityType: "project",
      entityId: String(project?._id || ""),
      metadata: {
        projectId: String(project?._id || ""),
        projectName: project?.title || null,
        applicationId: String(application?._id || ""),
      },
    });
  }

  async _notifyVolunteerApplicationRejected({
    project,
    application,
    actor,
    rejectReason,
  }) {
    return this._safeCreateNotification({
      recipientId: application.volunteerId,
      actorId: actor?._id || actor?.id || null,
      type: NOTIFICATION_TYPES.VOLUNTEER_APPLICATION_REJECTED,
      title: "Đơn đăng ký tình nguyện đã bị từ chối",
      message: `Đơn đăng ký của bạn cho dự án "${project?.title || ""}" đã bị từ chối.`,
      actionUrl: this._buildVolunteerApplicationActionUrl(
        project?._id,
        application?._id
      ),
      entityType: "project",
      entityId: String(project?._id || ""),
      metadata: {
        projectId: String(project?._id || ""),
        projectName: project?.title || null,
        applicationId: String(application?._id || ""),
        rejectReason: rejectReason || null,
      },
    });
  }

  async _notifyOrganizerWithdrawRequested({ project, application, volunteer }) {
    if (!project?.organizerId) return;

    return this._safeCreateNotification({
      recipientId: project.organizerId,
      actorId: volunteer?._id || volunteer?.id || application?.volunteerId,
      type: NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REQUESTED,
      title: "Yêu cầu xin rút tình nguyện viên",
      message: `${volunteer?.fullName || "Một tình nguyện viên"} đã gửi yêu cầu xin rút khỏi dự án "${project?.title || ""}".`,
      actionUrl: this._buildOrganizerWithdrawActionUrl(
        project?._id,
        application?._id
      ),
      entityType: "project",
      entityId: String(project?._id || ""),
      metadata: {
        projectId: String(project?._id || ""),
        projectName: project?.title || null,
        volunteerId: String(application?.volunteerId || ""),
        applicationId: String(application?._id || ""),
        withdrawReason: application?.withdrawReason || null,
      },
    });
  }

  async _notifyVolunteerWithdrawApproved({ project, application, actor }) {
    return this._safeCreateNotification({
      recipientId: application.volunteerId,
      actorId: actor?._id || actor?.id || null,
      type: NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_APPROVED,
      title: "Yêu cầu xin rút đã được chấp nhận",
      message: `Organizer đã chấp nhận yêu cầu xin rút của bạn khỏi dự án "${project?.title || ""}".`,
      actionUrl: this._buildVolunteerApplicationActionUrl(
        project?._id,
        application?._id
      ),
      entityType: "project",
      entityId: String(project?._id || ""),
      metadata: {
        projectId: String(project?._id || ""),
        projectName: project?.title || null,
        applicationId: String(application?._id || ""),
      },
    });
  }

  async _notifyVolunteerWithdrawRejected({
    project,
    application,
    actor,
    reviewNote,
  }) {
    return this._safeCreateNotification({
      recipientId: application.volunteerId,
      actorId: actor?._id || actor?.id || null,
      type: NOTIFICATION_TYPES.VOLUNTEER_WITHDRAW_REJECTED,
      title: "Yêu cầu xin rút đã bị từ chối",
      message: `Organizer đã từ chối yêu cầu xin rút của bạn khỏi dự án "${project?.title || ""}".`,
      actionUrl: this._buildVolunteerApplicationActionUrl(
        project?._id,
        application?._id
      ),
      entityType: "project",
      entityId: String(project?._id || ""),
      metadata: {
        projectId: String(project?._id || ""),
        projectName: project?.title || null,
        applicationId: String(application?._id || ""),
        reviewNote: reviewNote || null,
      },
    });
  }

  _mapDerivedProjectStatus(application, project) {
    if (!project) return application.status;
    if (application.status === "PENDING") return "PENDING";
    if (application.status === "REJECTED") return "REJECTED";
    if (application.status === "WITHDRAW_REQUESTED") return "WITHDRAW_REQUESTED";
    if (application.status === "CANCELLED") return "CANCELLED";

    if (application.status === "APPROVED") {
      if (EXECUTING_LIKE_STATUSES.includes(project.status)) {
        return "IN_PROGRESS";
      }

      if (COMPLETED_LIKE_STATUSES.includes(project.status)) {
        return "COMPLETED";
      }

      return "JOINED";
    }

    return application.status;
  }

  async _runInTransaction(work) {
    if (
      this.transactionManager &&
      typeof this.transactionManager.runInTransaction === "function"
    ) {
      return this.transactionManager.runInTransaction(work);
    }

    return work(null);
  }

  async applyVolunteer(volunteerId, data) {
    const { opportunityId, changerId, skills, motivation, availability } = data;

    if (!opportunityId) {
      throw new AppError("Missing opportunityId", 400);
    }

    const volunteer = await this._ensureUserExists(volunteerId);
    const project = await this._ensureProjectExists(opportunityId);

    if (!project.needsVolunteers) {
      throw new AppError("This project is not recruiting volunteers", 400);
    }

    const latestProject = await this._getFreshProjectAfterVolunteerSync(opportunityId);

    if (latestProject.isVolunteerFull) {
      throw new AppError("This project has reached the volunteer limit", 400);
    }

    try {
      const created = await this.volunteerRepository.create({
        volunteerId,
        opportunityId,
        changerId,
        skills,
        motivation,
        availability,
      });

      await this._notifyOrganizerVolunteerApplied({
        project: latestProject,
        application: created,
        volunteer,
      });

      return created;
    } catch (e) {
      if (e?.code === 11000) {
        throw new AppError("Already applied", 400);
      }
      throw e;
    }
  }

  async application(volunteerId, data) {
    const { opportunityId } = data;

    if (!opportunityId) {
      throw new AppError("Missing opportunityId", 400);
    }

    await this._syncVolunteerOnlyProjectExecutionStatus(opportunityId);

    const application = await this.volunteerRepository.application({
      volunteerId,
      opportunityId,
    });

    if (!application) {
      return {
        hasApplied: false,
        status: null,
      };
    }

    return {
      hasApplied: true,
      id: application.id,
      status: application.status,
      skills: application.skills,
      motivation: application.motivation,
      availability: application.availability,
      withdrawReason: application.withdrawReason || null,
      withdrawRequestedAt: application.withdrawRequestedAt || null,
      withdrawReviewedAt: application.withdrawReviewedAt || null,
      withdrawReviewNote: application.withdrawReviewNote || null,
    };
  }

  async updateApplication(userId, id, updateData) {
    const application = await this.volunteerRepository.findById(id);
    if (!application) throw new AppError("Application not found", 404);

    if (String(application.volunteerId) !== String(userId)) {
      throw new AppError("You do not have permission to update this application", 403);
    }

    if (application.status !== "PENDING") {
      throw new AppError("Only pending applications can be updated", 400);
    }

    return this.volunteerRepository.update(
      id,
      {
        skills: updateData.skills,
        availability: updateData.availability,
        motivation: updateData.motivation,
      },
      userId
    );
  }

  async cancelApplication(id, changerId) {
    const application = await this.volunteerRepository.findById(id);
    if (!application) throw new AppError("Application not found", 404);

    if (String(application.volunteerId) !== String(changerId)) {
      throw new AppError("You do not have permission to cancel this application", 403);
    }

    if (application.status !== "PENDING") {
      throw new AppError("Only pending applications can be cancelled directly", 400);
    }

    return this.volunteerRepository.update(
      id,
      {
        status: "CANCELLED",
        withdrawReason: null,
        withdrawRequestedAt: null,
        withdrawReviewedAt: null,
        withdrawReviewNote: null,
      },
      changerId
    );
  }

  async requestWithdraw(id, changerId, withdrawReason) {
    const application = await this.volunteerRepository.findById(id);
    if (!application) throw new AppError("Application not found", 404);

    if (String(application.volunteerId) !== String(changerId)) {
      throw new AppError("You do not have permission to request withdrawal", 403);
    }

    if (application.status !== "APPROVED") {
      throw new AppError("Only approved applications can request withdrawal", 400);
    }

    const reason = String(withdrawReason || "").trim();
    if (!reason) {
      throw new AppError("Withdraw reason is required", 400);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    const volunteer = await this._ensureUserExists(changerId);

    const updated = await this.volunteerRepository.update(
      id,
      {
        status: "WITHDRAW_REQUESTED",
        withdrawReason: reason,
        withdrawRequestedAt: new Date(),
        withdrawReviewedAt: null,
        withdrawReviewNote: null,
      },
      changerId
    );

    await this._notifyOrganizerWithdrawRequested({
      project,
      application: updated,
      volunteer,
    });

    return updated;
  }

  async approveVolunteer(applicationId, actorId) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) throw new AppError("Application not found", 404);

    if (application.status !== "PENDING") {
      throw new AppError("Can only approve pending applications", 400);
    }

    const initialProject = await this._ensureProjectExists(application.opportunityId);
    const actor = await this._ensureActorCanReviewProject(actorId, initialProject);

    if (!initialProject.needsVolunteers) {
      throw new AppError("This project is not recruiting volunteers", 400);
    }

    const result = await this._runInTransaction(async (session) => {
      const txApplication = await this.volunteerRepository.findById(applicationId, session);
      if (!txApplication) {
        throw new AppError("Application not found", 404);
      }

      if (txApplication.status !== "PENDING") {
        throw new AppError("Can only approve pending applications", 400);
      }

      const txProject = await this._getFreshProjectAfterVolunteerSync(
        txApplication.opportunityId,
        session
      );

      if (!txProject.needsVolunteers) {
        throw new AppError("This project is not recruiting volunteers", 400);
      }

      if (txProject.isVolunteerFull) {
        throw new AppError("This project has reached the volunteer limit", 400);
      }

      const updatedApplication = await this.volunteerRepository.update(
        applicationId,
        {
          status: "APPROVED",
          rejectReason: null,
          withdrawReason: null,
          withdrawRequestedAt: null,
          withdrawReviewedAt: null,
          withdrawReviewNote: null,
        },
        actorId,
        session
      );

      await this.projectRepository.incrementProjectStats(
        txProject._id,
        { "stats.currentVolunteers": 1 },
        session
      );

      const syncedProject = await this._getFreshProjectAfterVolunteerSync(
        txProject._id,
        session
      );

      return {
        application: updatedApplication,
        project: syncedProject,
        volunteerId: txApplication.volunteerId,
      };
    });

    await this._syncApprovedVolunteerToProjectConversation({
      project: result.project,
      volunteerId: result.volunteerId,
      actorId,
    });

    await this._notifyVolunteerApplicationApproved({
      project: result.project,
      application: result.application,
      actor,
    });

    return result.application;
  }

  async rejectVolunteer(applicationId, actorId, rejectReason) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) throw new AppError("Application not found", 404);

    if (application.status !== "PENDING") {
      throw new AppError("Can only reject pending applications", 400);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    const actor = await this._ensureActorCanReviewProject(actorId, project);
    const normalizedRejectReason = String(rejectReason || "").trim() || null;

    const updated = await this.volunteerRepository.update(
      applicationId,
      {
        status: "REJECTED",
        rejectReason: normalizedRejectReason,
      },
      actorId
    );

    await this._notifyVolunteerApplicationRejected({
      project,
      application: updated,
      actor,
      rejectReason: normalizedRejectReason,
    });

    return updated;
  }

  async restoreVolunteer(applicationId, userId) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) throw new AppError("Application not found", 404);

    const project = await this._ensureProjectExists(application.opportunityId);
    await this._ensureActorCanReviewProject(userId, project);

    if (!["REJECTED", "CANCELLED"].includes(application.status)) {
      throw new AppError("Only rejected or cancelled applications can be restored", 400);
    }

    return this.volunteerRepository.update(
      applicationId,
      {
        status: "PENDING",
        rejectReason: null,
        withdrawReason: null,
        withdrawRequestedAt: null,
        withdrawReviewedAt: null,
        withdrawReviewNote: null,
      },
      userId
    );
  }

  async approveWithdraw(applicationId, actorId) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) throw new AppError("Application not found", 404);

    if (application.status !== "WITHDRAW_REQUESTED") {
      throw new AppError("Can only approve pending withdraw requests", 400);
    }

    const initialProject = await this._ensureProjectExists(application.opportunityId);
    const actor = await this._ensureActorCanReviewProject(actorId, initialProject);

    const result = await this._runInTransaction(async (session) => {
      const txApplication = await this.volunteerRepository.findById(applicationId, session);
      if (!txApplication) {
        throw new AppError("Application not found", 404);
      }

      if (txApplication.status !== "WITHDRAW_REQUESTED") {
        throw new AppError("Can only approve pending withdraw requests", 400);
      }

      const updatedApplication = await this.volunteerRepository.update(
        applicationId,
        {
          status: "CANCELLED",
          withdrawReviewedAt: new Date(),
        },
        actorId,
        session
      );

      await this.projectRepository.incrementProjectStats(
        txApplication.opportunityId,
        { "stats.currentVolunteers": -1 },
        session
      );

      const syncedProject = await this._getFreshProjectAfterVolunteerSync(
        txApplication.opportunityId,
        session
      );

      return {
        application: updatedApplication,
        project: syncedProject,
        volunteerId: txApplication.volunteerId,
      };
    });

    await this._removeVolunteerFromProjectConversation({
      project: result.project,
      volunteerId: result.volunteerId,
      actorId,
    });

    await this._notifyVolunteerWithdrawApproved({
      project: result.project,
      application: result.application,
      actor,
    });

    return result.application;
  }

  async rejectWithdraw(applicationId, actorId, reviewNote) {
    const application = await this.volunteerRepository.findById(applicationId);
    if (!application) throw new AppError("Application not found", 404);

    if (application.status !== "WITHDRAW_REQUESTED") {
      throw new AppError("Can only reject pending withdraw requests", 400);
    }

    const project = await this._ensureProjectExists(application.opportunityId);
    const actor = await this._ensureActorCanReviewProject(actorId, project);

    const note = String(reviewNote || "").trim() || null;

    const updated = await this.volunteerRepository.update(
      applicationId,
      {
        status: "APPROVED",
        withdrawReviewedAt: new Date(),
        withdrawReviewNote: note,
      },
      actorId
    );

    await this._notifyVolunteerWithdrawRejected({
      project,
      application: updated,
      actor,
      reviewNote: note,
    });

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
      view = "ALL",
      search = "",
      page = 1,
      limit = 12,
    } = filters;

    const applications = await this.volunteerRepository.findByUserWithProject(userId);

    const syncedApplications = await Promise.all(
      applications.map(async (application) => {
        const projectId = application?.opportunityId?._id;
        if (projectId) {
          const refreshedProject = await this._getFreshProjectAfterVolunteerSync(projectId);
          return {
            ...application,
            opportunityId: refreshedProject || application.opportunityId,
          };
        }
        return application;
      })
    );

    const normalizedSearch = String(search || "").trim().toLowerCase();

    const items = syncedApplications
      .map((application) => {
        const project = application.opportunityId || null;
        const derivedStatus = this._mapDerivedProjectStatus(application, project);

        return {
          applicationId: String(application._id),
          applicationStatus: application.status,
          appliedAt: application.appliedAt || application.createdAt,
          rejectReason: application.rejectReason || null,
          reason: application.reason || null,
          withdrawReason: application.withdrawReason || null,
          withdrawRequestedAt: application.withdrawRequestedAt || null,
          withdrawReviewedAt: application.withdrawReviewedAt || null,
          withdrawReviewNote: application.withdrawReviewNote || null,
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

        if (!matchesSearch) return false;

        switch (view) {
          case "JOINED":
            return item.applicationStatus === "APPROVED";
          case "IN_PROGRESS":
            return (
              item.applicationStatus === "APPROVED" &&
              EXECUTING_LIKE_STATUSES.includes(item.project?.status)
            );
          case "COMPLETED":
            return (
              item.applicationStatus === "APPROVED" &&
              COMPLETED_LIKE_STATUSES.includes(item.project?.status)
            );
          case "PENDING":
            return item.applicationStatus === "PENDING";
          case "REJECTED":
            return item.applicationStatus === "REJECTED";
          case "WITHDRAW_REQUESTED":
            return item.applicationStatus === "WITHDRAW_REQUESTED";
          case "CANCELLED":
            return item.applicationStatus === "CANCELLED";
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
      totalApplications: syncedApplications.length,
      totalSupported: syncedApplications.filter((item) => item.status === "APPROVED").length,
      joined: syncedApplications.filter((item) => item.status === "APPROVED").length,
      inProgress: syncedApplications.filter(
        (item) =>
          item.status === "APPROVED" &&
          EXECUTING_LIKE_STATUSES.includes(item.opportunityId?.status)
      ).length,
      completed: syncedApplications.filter(
        (item) =>
          item.status === "APPROVED" &&
          COMPLETED_LIKE_STATUSES.includes(item.opportunityId?.status)
      ).length,
      pending: syncedApplications.filter((item) => item.status === "PENDING").length,
      rejected: syncedApplications.filter((item) => item.status === "REJECTED").length,
      withdrawRequested: syncedApplications.filter((item) => item.status === "WITHDRAW_REQUESTED").length,
      cancelled: syncedApplications.filter((item) => item.status === "CANCELLED").length,
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
    await this._syncVolunteerOnlyProjectExecutionStatus(projectId);

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
    await this._syncVolunteerOnlyProjectExecutionStatus(projectId);

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