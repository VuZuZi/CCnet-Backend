import AppError from "../../core/AppError.js";

const REVIEW_DEADLINE_MS = 60 * 60 * 1000;

const NOTIFICATION_TYPE_REVIEW_REQUIRED = "volunteer_review_required";
const NOTIFICATION_TYPE_REVIEW_SUBMITTED = "volunteer_review_submitted";
const NOTIFICATION_TYPE_REVIEW_AUTO_MAXED = "volunteer_review_auto_maxed";

class VolunteerEngagementService {
  constructor({
    volunteerAttendanceRepository,
    volunteerReviewRepository,
    volunteerRepository,
    projectRepository,
    userRepository,
    jobQueue = null,
    notificationService = null,
    transactionManager = null,
  }) {
    this.volunteerAttendanceRepository = volunteerAttendanceRepository;
    this.volunteerReviewRepository = volunteerReviewRepository;
    this.volunteerRepository = volunteerRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.jobQueue = jobQueue;
    this.notificationService = notificationService;
    this.transactionManager = transactionManager;
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

  async _ensureProject(projectId, session = null) {
    const project = await this.projectRepository.findById(projectId, session);
    if (!project) throw new AppError("Không tìm thấy dự án", 404);
    return project;
  }

  async _ensureMilestone(project, milestoneId) {
    const milestone = Array.isArray(project?.milestones)
      ? project.milestones.find(
          (item) => String(item?.milestoneId) === String(milestoneId)
        )
      : null;

    if (!milestone) {
      throw new AppError("Không tìm thấy milestone", 404);
    }

    return milestone;
  }

  async _ensureActorCanManage(project, actorId) {
    const actor = await this.userRepository.findById(actorId);
    if (!actor) throw new AppError("Không tìm thấy người dùng", 404);

    const actorRole = String(actor.role || "").toLowerCase();
    const isAdmin = actorRole === "admin" || actorRole === "manager";
    const isOwner =
      String(project?.organizerId || "") === String(actorId);

    if (!isAdmin && !isOwner) {
      throw new AppError("Bạn không có quyền thực hiện hành động này", 403);
    }

    return actor;
  }

  async _safeNotify(payload) {
    if (!this.notificationService) return null;

    try {
      return await this.notificationService.createNotification(payload);
    } catch (error) {
      console.error(
        "❌ [VolunteerEngagementService] createNotification error:",
        error?.message || error
      );
      return null;
    }
  }

  async _scheduleAutoReview(review) {
    if (!this.jobQueue || !review?._id || !review?.deadlineAt) return null;

    const delayMs = Math.max(
      new Date(review.deadlineAt).getTime() - Date.now(),
      0
    );

    try {
      return await this.jobQueue.addJob(
        "volunteer-review",
        "auto-max-review",
        { reviewId: String(review._id) },
        {
          delay: delayMs,
          jobId: `auto-max-review:${String(review._id)}`,
        }
      );
    } catch (error) {
      console.error(
        "❌ [VolunteerEngagementService] schedule auto review error:",
        error?.message || error
      );
      return null;
    }
  }

  async bootstrapAttendance(projectId, milestoneId, actorId) {
    const project = await this._ensureProject(projectId);
    await this._ensureActorCanManage(project, actorId);
    this._ensureMilestone(project, milestoneId);

    const approvedApplications =
      await this.volunteerRepository.findByProject(projectId, "APPROVED", 500);

    const records = approvedApplications.map((application) => ({
      projectId,
      milestoneId,
      applicationId: application._id,
      volunteerId: application.volunteerId?._id || application.volunteerId,
      organizerId: project.organizerId,
      status: "PENDING",
      note: "",
      confirmedAt: null,
      confirmedBy: null,
    }));

    const items = await this.volunteerAttendanceRepository.bulkUpsert(records);

    return {
      items,
      summary: {
        total: items.length,
        attended: items.filter((item) => item.status === "ATTENDED").length,
        absent: items.filter((item) => item.status === "ABSENT").length,
        pending: items.filter((item) => item.status === "PENDING").length,
      },
    };
  }

  async getAttendanceList(projectId, milestoneId, actorId) {
    const project = await this._ensureProject(projectId);
    await this._ensureActorCanManage(project, actorId);
    this._ensureMilestone(project, milestoneId);

    const items = await this.volunteerAttendanceRepository.findByProjectAndMilestone(
      projectId,
      milestoneId
    );

    return {
      items,
      summary: {
        total: items.length,
        attended: items.filter((item) => item.status === "ATTENDED").length,
        absent: items.filter((item) => item.status === "ABSENT").length,
        pending: items.filter((item) => item.status === "PENDING").length,
      },
    };
  }

  async updateAttendance(attendanceId, actorId, payload) {
    const attendance = await this.volunteerAttendanceRepository.findById(attendanceId);
    if (!attendance) throw new AppError("Không tìm thấy bản ghi chấm công", 404);

    const project = await this._ensureProject(attendance.projectId);
    await this._ensureActorCanManage(project, actorId);

    const updated = await this.volunteerAttendanceRepository.updateById(attendanceId, {
      status: payload.status,
      note: String(payload.note || "").trim(),
      confirmedAt: new Date(),
      confirmedBy: actorId,
    });

    return updated;
  }

  async bootstrapReviews(projectId, milestoneId, actorId) {
    const project = await this._ensureProject(projectId);
    const actor = await this._ensureActorCanManage(project, actorId);
    this._ensureMilestone(project, milestoneId);

    const attendances =
      await this.volunteerAttendanceRepository.findByProjectAndMilestoneRaw(
        projectId,
        milestoneId
      );

    const attendedItems = attendances.filter(
      (item) => item.status === "ATTENDED"
    );

    const deadlineAt = new Date(Date.now() + REVIEW_DEADLINE_MS);

    const records = attendedItems.map((attendance) => ({
      projectId,
      milestoneId,
      applicationId: attendance.applicationId,
      attendanceId: attendance._id,
      volunteerId: attendance.volunteerId,
      organizerId: attendance.organizerId,
      score: null,
      comment: "",
      status: "PENDING",
      reviewSource: null,
      deadlineAt,
      reviewedAt: null,
      autoScoredAt: null,
    }));

    const items = await this.volunteerReviewRepository.bulkUpsert(records);

    for (const review of items) {
      await this._scheduleAutoReview(review);

      await this._safeNotify({
        recipientId: actorId,
        actorId: actor?._id || actor?.id || null,
        type: NOTIFICATION_TYPE_REVIEW_REQUIRED,
        title: "Cần đánh giá tình nguyện viên",
        message: `Milestone "${milestoneId}" đã sẵn sàng để đánh giá tình nguyện viên.`,
        actionUrl: `/projects/${projectId}?tab=volunteer&subTab=approved`,
        entityType: "project",
        entityId: String(projectId),
        metadata: {
          projectId: String(projectId),
          milestoneId: String(milestoneId),
          reviewId: String(review._id),
        },
      });
    }

    return {
      items,
      summary: {
        total: items.length,
        pending: items.filter((item) => item.status === "PENDING").length,
        reviewed: items.filter((item) => item.status === "REVIEWED").length,
        autoMaxed: items.filter((item) => item.status === "AUTO_MAXED").length,
        deadlineAt,
      },
    };
  }

  async getReviewList(projectId, milestoneId, actorId) {
    const project = await this._ensureProject(projectId);
    await this._ensureActorCanManage(project, actorId);
    this._ensureMilestone(project, milestoneId);

    const items = await this.volunteerReviewRepository.findByProjectAndMilestone(
      projectId,
      milestoneId
    );

    return {
      items,
      summary: {
        total: items.length,
        pending: items.filter((item) => item.status === "PENDING").length,
        reviewed: items.filter((item) => item.status === "REVIEWED").length,
        autoMaxed: items.filter((item) => item.status === "AUTO_MAXED").length,
      },
    };
  }

  async submitReview(reviewId, actorId, payload) {
    const review = await this.volunteerReviewRepository.findById(reviewId);
    if (!review) throw new AppError("Không tìm thấy đánh giá", 404);

    const project = await this._ensureProject(review.projectId);
    const actor = await this._ensureActorCanManage(project, actorId);

    if (review.status !== "PENDING") {
      throw new AppError("Đánh giá này đã được xử lý", 400);
    }

    const updated = await this.volunteerReviewRepository.updateById(reviewId, {
      score: payload.score,
      comment: String(payload.comment || "").trim(),
      status: "REVIEWED",
      reviewSource: "MANUAL",
      reviewedAt: new Date(),
      autoScoredAt: null,
    });

    await this._safeNotify({
      recipientId: updated.volunteerId?._id || updated.volunteerId,
      actorId: actor?._id || actor?.id || null,
      type: NOTIFICATION_TYPE_REVIEW_SUBMITTED,
      title: "Bạn đã được đánh giá",
      message: `Organizer đã gửi đánh giá cho sự tham gia của bạn ở milestone "${updated.milestoneId}".`,
      actionUrl: `/projects/${updated.projectId}`,
      entityType: "project",
      entityId: String(updated.projectId),
      metadata: {
        projectId: String(updated.projectId),
        milestoneId: String(updated.milestoneId),
        reviewId: String(updated._id),
        score: updated.score,
      },
    });

    return updated;
  }

  async autoMaxReview(reviewId) {
    const review = await this.volunteerReviewRepository.findById(reviewId);
    if (!review) return null;
    if (review.status !== "PENDING") return review;
    if (new Date(review.deadlineAt).getTime() > Date.now()) return review;

    const updated = await this.volunteerReviewRepository.updateById(reviewId, {
      score: 5,
      comment: "Hệ thống tự động chấm tối đa do organizer không đánh giá đúng hạn.",
      status: "AUTO_MAXED",
      reviewSource: "AUTO",
      reviewedAt: new Date(),
      autoScoredAt: new Date(),
    });

    await this._safeNotify({
      recipientId: updated.organizerId,
      actorId: null,
      type: NOTIFICATION_TYPE_REVIEW_AUTO_MAXED,
      title: "Đã tự động chấm điểm tối đa",
      message: `Một đánh giá volunteer đã được hệ thống tự động chấm tối đa do quá hạn 1 giờ.`,
      actionUrl: `/projects/${updated.projectId}?tab=volunteer&subTab=approved`,
      entityType: "project",
      entityId: String(updated.projectId),
      metadata: {
        projectId: String(updated.projectId),
        milestoneId: String(updated.milestoneId),
        reviewId: String(updated._id),
        score: 5,
      },
    });

    await this._safeNotify({
      recipientId: updated.volunteerId?._id || updated.volunteerId,
      actorId: null,
      type: NOTIFICATION_TYPE_REVIEW_AUTO_MAXED,
      title: "Bạn đã được hệ thống đánh giá tự động",
      message:
        "Organizer chưa đánh giá đúng hạn, hệ thống đã tự động chấm tối đa cho bạn.",
      actionUrl: `/projects/${updated.projectId}`,
      entityType: "project",
      entityId: String(updated.projectId),
      metadata: {
        projectId: String(updated.projectId),
        milestoneId: String(updated.milestoneId),
        reviewId: String(updated._id),
        score: 5,
      },
    });

    return updated;
  }
}

export default VolunteerEngagementService;