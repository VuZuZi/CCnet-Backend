import AppError from "../../core/AppError.js";

const REVIEW_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

const NOTIFICATION_TYPE_REVIEW_REQUIRED = "volunteer_review_required";
const NOTIFICATION_TYPE_REVIEW_SUBMITTED = "volunteer_review_submitted";

const COMPLETED_PROJECT_STATUSES = new Set([
  "COMPLETED",
  "COMPLETED_SUCCESSFULLY",
  "COMPLETED_PARTIAL",
]);

class VolunteerEngagementService {
  constructor({
    volunteerReviewRepository,
    volunteerRepository,
    projectRepository,
    userRepository = null,
    jobQueue = null,
    notificationService = null,
  }) {
    this.volunteerReviewRepository = volunteerReviewRepository;
    this.volunteerRepository = volunteerRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.jobQueue = jobQueue;
    this.notificationService = notificationService;
  }

  async _ensureProject(projectId) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Không tìm thấy dự án", 404);
    }
    return project;
  }

  _extractOrganizerId(project) {
    return (
      project?.organizerId?._id ||
      project?.organizerId?.id ||
      project?.organizerId ||
      project?.organizer?._id ||
      project?.organizer?.id ||
      project?.organizer ||
      null
    );
  }

  _extractVolunteerId(application) {
    return (
      application?.volunteerId?._id ||
      application?.volunteerId?.id ||
      application?.volunteerId ||
      application?.userId?._id ||
      application?.userId?.id ||
      application?.userId ||
      null
    );
  }

  _extractReviewVolunteerId(review) {
    return (
      review?.volunteerId?._id ||
      review?.volunteerId?.id ||
      review?.volunteerId ||
      null
    );
  }

  _isReviewLegacy(review) {
    if (!review) return true;

    const hasLegacyFields =
      "milestoneId" in review ||
      "attendanceId" in review ||
      "autoScoredAt" in review;

    const invalidScore =
      review.score === null ||
      review.score === undefined ||
      Number.isNaN(Number(review.score));

    const invalidComment =
      review.comment === null || review.comment === undefined;

    const invalidDeadline =
      !review.deadlineAt || Number.isNaN(new Date(review.deadlineAt).getTime());

    return hasLegacyFields || invalidScore || invalidComment || invalidDeadline;
  }

  async _safeNotify(payload) {
    if (!this.notificationService) return null;

    try {
      return await this.notificationService.createNotification(payload);
    } catch (error) {
      console.error("❌ [VolunteerEngagementService] Notification error:", {
        type: payload?.type,
        recipientId: payload?.recipientId,
        message: error?.message || error,
      });
      return null;
    }
  }

  async _scheduleAutoReview(review) {
    if (
      !this.jobQueue ||
      !review?._id ||
      !review?.deadlineAt ||
      typeof this.jobQueue.addJob !== "function"
    ) {
      return null;
    }

    const delay = Math.max(
      new Date(review.deadlineAt).getTime() - Date.now(),
      0
    );

    try {
      return await this.jobQueue.addJob(
        "volunteer-review",
        "auto-review",
        { reviewId: String(review._id) },
        {
          delay,
          jobId: `auto-review:${String(review._id)}`,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        }
      );
    } catch (error) {
      console.error(
        "❌ [VolunteerEngagementService] Schedule auto review error:",
        error?.message || error
      );
      return null;
    }
  }

  async _getApprovedApplications(projectId) {
    if (!this.volunteerRepository) return [];

    const candidates = [
      async () => {
        if (
          typeof this.volunteerRepository.findByProjectAndStatus === "function"
        ) {
          return this.volunteerRepository.findByProjectAndStatus(
            projectId,
            "APPROVED"
          );
        }
        return null;
      },
      async () => {
        if (typeof this.volunteerRepository.findByProject === "function") {
          return this.volunteerRepository.findByProject(
            projectId,
            "APPROVED",
            500
          );
        }
        return null;
      },
      async () => {
        if (typeof this.volunteerRepository.findAllByProject === "function") {
          const all = await this.volunteerRepository.findAllByProject(projectId);
          return Array.isArray(all)
            ? all.filter(
                (item) => String(item?.status || "").toUpperCase() === "APPROVED"
              )
            : [];
        }
        return null;
      },
    ];

    for (const getter of candidates) {
      try {
        const result = await getter();
        if (!result) continue;

        if (Array.isArray(result)) return result;
        if (Array.isArray(result?.data)) return result.data;
        if (Array.isArray(result?.items)) return result.items;
      } catch (error) {
        console.error(
          "⚠️ [VolunteerEngagementService] approved applications fallback error:",
          error?.message || error
        );
      }
    }

    return [];
  }

  async _shouldRebuildReviewWorkflow(projectId) {
    const existingReviews =
      await this.volunteerReviewRepository.findByProject(projectId);

    if (!existingReviews.length) {
      return {
        shouldRebuild: false,
        existingReviews: [],
      };
    }

    const hasLegacy = existingReviews.some((review) =>
      this._isReviewLegacy(review)
    );
    const hasExpiredPending = existingReviews.some(
      (review) =>
        review.status === "PENDING" &&
        review.deadlineAt &&
        new Date(review.deadlineAt).getTime() < Date.now()
    );

    if (hasLegacy || hasExpiredPending) {
      return {
        shouldRebuild: true,
        existingReviews,
      };
    }

    return {
      shouldRebuild: false,
      existingReviews,
    };
  }

  async onProjectCompleted(projectId) {
    const project = await this._ensureProject(projectId);

    const normalizedStatus = String(project?.status || "").toUpperCase();
    if (!COMPLETED_PROJECT_STATUSES.has(normalizedStatus)) {
      return [];
    }

    const organizerId = this._extractOrganizerId(project);

    const { shouldRebuild, existingReviews } =
      await this._shouldRebuildReviewWorkflow(projectId);

    if (existingReviews.length > 0 && !shouldRebuild) {
      return existingReviews;
    }

    if (shouldRebuild) {
      await this.volunteerReviewRepository.deleteByProject(projectId);
    }

    const approvedApplications = await this._getApprovedApplications(projectId);

    if (!approvedApplications.length) {
      return [];
    }

    const deadlineAt = new Date(Date.now() + REVIEW_DEADLINE_MS);

    const records = approvedApplications
      .map((application) => {
        const volunteerId = this._extractVolunteerId(application);
        if (!volunteerId) return null;

        return {
          projectId,
          applicationId: application._id,
          volunteerId,
          organizerId,
          score: 5,
          comment: "Bạn đã hoàn thành tốt vai trò tình nguyện viên trong dự án.",
          status: "PENDING",
          reviewSource: null,
          deadlineAt,
          reviewedAt: null,
        };
      })
      .filter(Boolean);

    if (!records.length) {
      return [];
    }

    const items = await this.volunteerReviewRepository.bulkUpsert(records);

    for (const review of items) {
      await this._scheduleAutoReview(review);
    }

    await this._safeNotify({
      recipientId: organizerId,
      actorId: null,
      type: NOTIFICATION_TYPE_REVIEW_REQUIRED,
      title: "Dự án đã hoàn thành",
      message:
        "Vui lòng đánh giá tình nguyện viên trong vòng 1 tuần kể từ khi dự án hoàn thành.",
      actionUrl: `/projects/${projectId}?tab=volunteer&subTab=review`,
      entityType: "project",
      entityId: String(projectId),
      metadata: {
        projectId: String(projectId),
        deadlineAt: deadlineAt.toISOString(),
      },
    });

    return items;
  }

  async getProjectReviews(projectId, actorId) {
    const project = await this._ensureProject(projectId);

    const organizerId = this._extractOrganizerId(project);
    if (String(actorId || "") !== String(organizerId || "")) {
      throw new AppError("Bạn không có quyền xem đánh giá của dự án này", 403);
    }

    return this.volunteerReviewRepository.findByProject(projectId);
  }

  async getMyProjectReview(projectId, actorId) {
    await this._ensureProject(projectId);

    const reviews = await this.volunteerReviewRepository.findByProject(projectId);

    const myReview =
      reviews.find((review) => {
        const volunteerId = this._extractReviewVolunteerId(review);
        return String(volunteerId || "") === String(actorId || "");
      }) || null;

    if (!myReview || myReview.status !== "REVIEWED") {
      return null;
    }

    return myReview;
  }

  async submitReview(reviewId, actorId, payload) {
    const review = await this.volunteerReviewRepository.findById(reviewId);
    if (!review) {
      throw new AppError("Không tìm thấy đánh giá", 404);
    }

    const project = await this._ensureProject(review.projectId);
    const organizerId = this._extractOrganizerId(project);

    if (String(actorId || "") !== String(organizerId || "")) {
      throw new AppError("Bạn không có quyền thực hiện hành động này", 403);
    }

    if (review.status !== "PENDING") {
      throw new AppError("Đánh giá này đã được xử lý", 400);
    }

    if (new Date(review.deadlineAt).getTime() < Date.now()) {
      throw new AppError("Đã quá thời hạn cập nhật đánh giá", 400);
    }

    const updated = await this.volunteerReviewRepository.updateById(reviewId, {
      score: Number(payload.score || 5),
      comment:
        String(payload.comment || "").trim() ||
        "Bạn đã hoàn thành tốt vai trò tình nguyện viên trong dự án.",
      status: "REVIEWED",
      reviewSource: "MANUAL",
      reviewedAt: new Date(),
    });

    const volunteerId = this._extractReviewVolunteerId(updated);

    await this._safeNotify({
      recipientId: volunteerId,
      actorId,
      type: NOTIFICATION_TYPE_REVIEW_SUBMITTED,
      title: "Bạn đã nhận được đánh giá",
      message: "Organizer đã hoàn tất đánh giá cho phần tham gia của bạn.",
      actionUrl: `/projects/${updated.projectId}`,
      entityType: "project",
      entityId: String(updated.projectId),
      metadata: {
        projectId: String(updated.projectId),
        reviewId: String(updated._id),
        score: updated.score,
      },
    });

    return updated;
  }

  async autoFinalizeReview(reviewId) {
    const review = await this.volunteerReviewRepository.findById(reviewId);
    if (!review) return null;
    if (review.status !== "PENDING") return review;
    if (new Date(review.deadlineAt).getTime() > Date.now()) return review;

    const updated = await this.volunteerReviewRepository.updateById(reviewId, {
      score: 5,
      comment: "Bạn đã hoàn thành tốt vai trò tình nguyện viên trong dự án.",
      status: "REVIEWED",
      reviewSource: "AUTO",
      reviewedAt: new Date(),
    });

    const volunteerId = this._extractReviewVolunteerId(updated);

    await this._safeNotify({
      recipientId: volunteerId,
      actorId: null,
      type: NOTIFICATION_TYPE_REVIEW_SUBMITTED,
      title: "Bạn đã nhận được đánh giá",
      message: "Bạn đã nhận được đánh giá cho phần tham gia dự án.",
      actionUrl: `/projects/${updated.projectId}`,
      entityType: "project",
      entityId: String(updated.projectId),
      metadata: {
        projectId: String(updated.projectId),
        reviewId: String(updated._id),
        score: updated.score,
      },
    });

    return updated;
  }

  async reconcileCompletedProjectReviews() {
    if (!this.projectRepository) return [];

    let candidateProjects = [];

    try {
      if (typeof this.projectRepository.findAllProjects === "function") {
        const result = await this.projectRepository.findAllProjects({
          filter: {
            status: {
              $in: Array.from(COMPLETED_PROJECT_STATUSES),
            },
            needsVolunteers: true,
          },
          skip: 0,
          limit: 200,
          sortType: "newest",
        });

        candidateProjects = Array.isArray(result?.projects)
          ? result.projects
          : [];
      }
    } catch (error) {
      console.error(
        "❌ [VolunteerEngagementService] reconcile query failed:",
        error?.message || error
      );
      return [];
    }

    if (!candidateProjects.length) {
      return [];
    }

    const needInit = [];

    for (const project of candidateProjects) {
      try {
        const { shouldRebuild, existingReviews } =
          await this._shouldRebuildReviewWorkflow(project._id);

        if (shouldRebuild || existingReviews.length === 0) {
          needInit.push(project);
        }
      } catch (error) {
        console.error(
          "❌ [VolunteerEngagementService] check review workflow failed:",
          error?.message || error
        );
      }
    }

    if (!needInit.length) {
      return [];
    }

    console.log(
      `[ReviewReconciler] found ${needInit.length} completed project(s) needing review workflow init`
    );

    const handled = [];

    for (const project of needInit) {
      try {
        await this.onProjectCompleted(project._id);
        handled.push(String(project._id));
        console.log(
          `[ReviewReconciler] initialized review workflow for project ${String(
            project._id
          )}`
        );
      } catch (error) {
        console.error(
          `[ReviewReconciler] failed for project ${String(project._id)}:`,
          error?.message || error
        );
      }
    }

    return handled;
  }
}

export default VolunteerEngagementService;