import AppError from "../../../core/AppError.js";
import { DOMAIN_EVENTS } from "../../../config/notification.js";
import { PROJECT_STATUS, PROJECT_TYPE } from "../../project/project.constant.js";
import {
  buildProjectActionName,
  buildProjectStatusNotificationMessage,
  buildProjectUpdateData,
  extractObjectId,
  getAllowedProjectTransitions,
  isApproveAction,
  mapIncomingProjectStatus,
  normalizeProjectStatus,
} from "../utils/adminProject.utils.js";

class AdminProjectService {
  constructor({
    adminProjectRepository,
    adminActionLogRepository,
    projectRepository,
    userRepository,
    escrowRepository,
    transactionManager,
    transactionService,
    jobQueue,
    eventBus,
    volunteerRepository,
    conversationService,
  }) {
    this.adminProjectRepository = adminProjectRepository;
    this.adminActionLogRepository = adminActionLogRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.escrowRepository = escrowRepository;
    this.transactionManager = transactionManager;
    this.transactionService = transactionService;
    this.jobQueue = jobQueue;
    this.eventBus = eventBus;
    this.volunteerRepository = volunteerRepository;
    this.conversationService = conversationService;
  }

  _ensureReason(reason) {
    const normalizedReason = String(reason || "").trim();

    if (!normalizedReason) {
      throw new AppError("Reason is required for this action.", 400);
    }

    return normalizedReason;
  }

  async _logAdminAction({
    actorId,
    actorRole = "admin",
    targetType,
    targetId,
    action,
    reason,
    previousState = null,
    nextState = null,
    metadata = null,
  }) {
    if (!actorId || !targetId) {
      return null;
    }

    return this.adminActionLogRepository.createAdminActionLog({
      actorId,
      actorRole,
      targetType,
      targetId,
      action,
      reason,
      previousState,
      nextState,
      metadata,
    });
  }

  _emitProjectStatusUpdated({ project, actorId, feedback }) {
    if (!project?.organizerId) return;
    if (!this.eventBus || typeof this.eventBus.emit !== "function") return;

    const organizerId = extractObjectId(project.organizerId);
    if (!organizerId) return;

    const { title, message } = buildProjectStatusNotificationMessage(
      project.title,
      project.status,
      feedback,
    );

    const actionUrl =
      project.status === PROJECT_STATUS.UPDATING
        ? `/projects/${project._id}/updating`
        : `/projects/${project._id}`;

    this.eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
      recipientIds: [String(organizerId)],
      actorId,
      projectId: project._id,
      projectName: project.title,
      status: project.status,
      title,
      message,
      actionUrl,
    });
  }

  _extractUserId(value) {
    if (!value) return "";

    if (typeof value === "object") {
      return String(value._id || "").trim();
    }

    return String(value).trim();
  }

  _emitProjectCancellationSystemNotification({
    project,
    actorId,
    recipientIds,
    feedback,
  }) {
    const uniqueRecipientIds = [
      ...new Set(
        (recipientIds || [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ];

    if (!uniqueRecipientIds.length) return;
    if (!this.eventBus || typeof this.eventBus.emit !== "function") return;

    const safeReason = String(feedback || "").trim() || "Không có lý do cụ thể";

    this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_ANNOUNCEMENT_CREATED, {
      actorId,
      userIds: uniqueRecipientIds,
      title: "Dự án đã bị hủy bởi hệ thống",
      message: `Dự án "${project?.title || "Dự án không tên"}" đã bị hủy bởi hệ thống. Lý do: ${safeReason}. Nếu bạn đã tham gia quyên góp, 100% số tiền gốc sẽ được hoàn trả tự động vào ví CCNet của bạn mà không mất bất kỳ khoản phí nào.`,
      actionUrl: `/projects/${project?._id}`,
      entityId: project?._id,
      severity: "high",
    });
  }

  async _syncProjectConversation(project, adminId = null) {
    if (!project) return null;
    if (!this.conversationService || !this.volunteerRepository) return null;

    const organizerId = extractObjectId(project.organizerId);
    if (!organizerId) return null;

    const approvedApplications = await this.volunteerRepository.findByProject(
      project._id,
      "APPROVED",
    );

    const approvedVolunteerIds = (approvedApplications || [])
      .map((item) => String(item?.volunteerId?._id || item?.volunteerId || ""))
      .filter(Boolean);

    return this.conversationService.ensureProjectGroupConversation({
      projectId: project._id,
      organizerId,
      participantIds: approvedVolunteerIds,
      groupName: project.title,
      actorId: adminId,
    });
  }

  async _ensureEscrowForFundedProject(projectId, projectType, session) {
    if (projectType !== PROJECT_TYPE.FUNDED) {
      return null;
    }

    if (!this.escrowRepository) {
      throw new AppError("Escrow repository is not available.", 500);
    }

    const existingEscrow = await this.escrowRepository.findByProjectId(
      projectId,
      session,
    );

    if (existingEscrow) {
      return existingEscrow;
    }

    return this.escrowRepository.create(
      {
        projectId,
        availableBalance: 0,
        totalDeposited: 0,
        pendingRefunds: 0,
        completedRefunds: 0,
        totalDisbursed: 0,
      },
      session,
    );
  }

  async getProjectDetail(projectId) {
    const project = await this.adminProjectRepository.findProjectById(projectId);

    if (!project) {
      throw new AppError("Project not found.", 404);
    }

    return project;
  }

  async updateProjectStatus(projectId, targetStatus, feedback, adminId, options = {}) {
    if (!targetStatus) {
      throw new AppError("Project status is required.", 400);
    }

    return this.transactionManager.runInTransaction(async (session) => {
      const project = await this.projectRepository.findById(projectId, session);

      if (!project) {
        throw new AppError("Project not found.", 404);
      }

      const currentStatus = normalizeProjectStatus(project.status);
      const finalStatus = mapIncomingProjectStatus(project, targetStatus);
      const allowedTransitions = getAllowedProjectTransitions(project);

      if (currentStatus === finalStatus) {
        if (options.conflictOnNoop) {
          throw new AppError(
            "Project status has already changed. Please reload.",
            409,
          );
        }

        return project;
      }

      if (
        options.expectedStatus &&
        currentStatus !== normalizeProjectStatus(options.expectedStatus)
      ) {
        throw new AppError("Project review data is stale. Please reload.", 409);
      }

      if (
        options.expectedSubmissionVersion !== undefined &&
        Number(project.submissionVersion || 0) !==
          Number(options.expectedSubmissionVersion)
      ) {
        throw new AppError("Project review data is stale. Please reload.", 409);
      }

      if (
        options.expectedProjectSnapshotHash !== undefined &&
        project.projectSnapshotHash !== options.expectedProjectSnapshotHash
      ) {
        throw new AppError("Project review data is stale. Please reload.", 409);
      }

      if (
        options.expectedReviewDecisionLockId !== undefined &&
        project.reviewDecisionLockId !== options.expectedReviewDecisionLockId
      ) {
        throw new AppError(
          "Project review decision is already in progress. Please reload.",
          409,
        );
      }

      if (!allowedTransitions.includes(finalStatus)) {
        throw new AppError(
          `Cannot transition project from ${currentStatus} to ${finalStatus}`,
          400,
        );
      }

      const approveAction = isApproveAction(currentStatus, finalStatus);
      const normalizedFeedback = approveAction
        ? String(feedback || "").trim()
        : this._ensureReason(feedback);

      if (
        finalStatus === PROJECT_STATUS.REVISION_REQUESTED &&
        Number(project.revisionCount || 0) >= 2
      ) {
        throw new AppError(
          "The project has exceeded the maximum of 2 revision requests.",
          400,
        );
      }

      const updateData = buildProjectUpdateData(
        project,
        finalStatus,
        normalizedFeedback,
        adminId,
      );

      let cancellationSummary = null;
      let cancellationRecipientIds = [];
      let userUpdate = null;

      if (finalStatus === PROJECT_STATUS.REJECTED) {
        const coolingPeriodEnd = new Date();
        coolingPeriodEnd.setDate(coolingPeriodEnd.getDate() + 7);
        userUpdate = { coolingPeriodEnd };
      }

      if (finalStatus === PROJECT_STATUS.CANCELLED_BY_PLATFORM) {
        cancellationSummary =
          await this.transactionService.processProjectCancellationRefund(
            projectId,
            {
              session,
              actorId: adminId,
            },
          );

        const totalRefunded = Number(cancellationSummary?.totalRefunded || 0);
        const refundedAt = totalRefunded > 0 ? new Date() : null;

        updateData.currentAmount = Math.max(
          0,
          Number(project?.currentAmount || 0) - totalRefunded,
        );

        updateData.refundSummary = {
          isRefunded: totalRefunded > 0,
          totalRefunded,
          donorCount: Number(cancellationSummary?.donorCount || 0),
          refundedAt,
          message:
            totalRefunded > 0
              ? `Hệ thống đã tự động hoàn 100% tiền cho ${Number(
                  cancellationSummary?.donorCount || 0,
                )} người dùng quyên góp do dự án bị hủy.`
              : "Không có giao dịch quyên góp hợp lệ nào cần hoàn tiền cho dự án này.",
        };

        const approvedVolunteers =
          await this.volunteerRepository.findByVolApproved(projectId, session);
        const pendingVolunteers =
          await this.volunteerRepository.findByVolPending(projectId, session);

        cancellationRecipientIds = [
          ...(cancellationSummary?.refundedUserIds || []),
          ...(approvedVolunteers || []).map((item) =>
            this._extractUserId(item?.volunteerId),
          ),
          ...(pendingVolunteers || []).map((item) =>
            this._extractUserId(item?.volunteerId),
          ),
        ];
      }

      if (approveAction) {
        await this._ensureEscrowForFundedProject(
          projectId,
          project.projectType,
          session,
        );
      }

      const updatedProject = options.expectedStatus
        ? await this.projectRepository.updateByIdWithExpected(
            projectId,
            updateData,
            {
              status: currentStatus,
              submissionVersion: options.expectedSubmissionVersion,
              projectSnapshotHash: options.expectedProjectSnapshotHash,
              reviewDecisionLockId: options.expectedReviewDecisionLockId,
            },
            session,
          )
        : await this.projectRepository.updateById(
            projectId,
            updateData,
            session,
          );

      if (!updatedProject) {
        throw new AppError("Project review data is stale. Please reload.", 409);
      }

      if (userUpdate) {
        await this.userRepository.updateById(
          extractObjectId(project.organizerId),
          userUpdate,
          session,
        );
      }

      if (finalStatus === PROJECT_STATUS.REVISION_REQUESTED && this.jobQueue) {
        this.jobQueue
          .addJob(
            "project-maintenance",
            "check-revision-timeout",
            { projectId },
            { delay: 14 * 24 * 60 * 60 * 1000 },
          )
          .catch((err) =>
            console.error(
              `[Queue] Failed to schedule timeout for ${projectId}`,
              err.message,
            ),
          );
      }

      const shouldSyncProjectConversation =
        approveAction ||
        String(updatedProject?.status) === PROJECT_STATUS.ACTIVE;

      if (shouldSyncProjectConversation) {
        await this._syncProjectConversation(updatedProject, adminId);
      }

      await this._logAdminAction({
        actorId: adminId,
        actorRole: "admin",
        targetType: "project",
        targetId: updatedProject._id,
        action: buildProjectActionName(currentStatus, finalStatus),
        reason:
          normalizedFeedback ||
          (approveAction
            ? `Approve project to ${finalStatus}`
            : `Change status to ${finalStatus}`),
        previousState: {
          status: currentStatus,
          projectType: project.projectType,
          title: project.title,
        },
        nextState: {
          status: finalStatus,
          projectType: updatedProject.projectType,
          title: updatedProject.title,
        },
        metadata: {
          projectTitle: updatedProject.title,
          projectType: updatedProject.projectType,
          organizerId: extractObjectId(updatedProject.organizerId),
        },
      });

      const notificationFeedback =
        finalStatus === PROJECT_STATUS.UPDATING
          ? updateData.updateRequestReason
          : updateData.rejectionReason;

      const isProjectReviewDecisionFlow = Boolean(
        options.expectedReviewDecisionLockId,
      );

      if (!isProjectReviewDecisionFlow) {
        this._emitProjectStatusUpdated({
          project: updatedProject,
          actorId: adminId,
          feedback: notificationFeedback,
        });
      }

      if (finalStatus === PROJECT_STATUS.CANCELLED_BY_PLATFORM) {
        this._emitProjectCancellationSystemNotification({
          project: updatedProject,
          actorId: adminId,
          recipientIds: cancellationRecipientIds,
          feedback: normalizedFeedback,
        });

        for (const allocation of cancellationSummary?.refundAllocations || []) {
          if (!allocation?.donorId || !allocation?.refundAmount) continue;

          this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_REFUNDED, {
            userId: String(allocation.donorId),
            transactionId: String(updatedProject._id),
            amount: Number(allocation.refundAmount || 0),
            isAutoRefund: true,
          });
        }
      }

      return updatedProject;
    });
  }
}

export default AdminProjectService;