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
      feedback
    );

    this.eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
      recipientIds: [String(organizerId)],
      actorId,
      projectId: project._id,
      projectName: project.title,
      status: project.status,
      title,
      message,
      actionUrl: `/projects/${project._id}`,
    });
  }

  async _syncProjectConversationOnActive(project, adminId = null) {
    if (!project || String(project.status) !== PROJECT_STATUS.ACTIVE) return null;
    if (!this.conversationService || !this.volunteerRepository) return null;

    const approvedApplications = await this.volunteerRepository.findByProject(
      project._id,
      "APPROVED"
    );

    const approvedVolunteerIds = (approvedApplications || [])
      .map((item) => String(item?.volunteerId?._id || item?.volunteerId || ""))
      .filter(Boolean);

    return this.conversationService.ensureProjectGroupConversation({
      projectId: project._id,
      organizerId: extractObjectId(project.organizerId),
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
      session
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
      session
    );
  }

  async getProjectDetail(projectId) {
    const project = await this.adminProjectRepository.findProjectById(projectId);

    if (!project) {
      throw new AppError("Project not found.", 404);
    }

    return project;
  }

  async updateProjectStatus(projectId, targetStatus, feedback, adminId) {
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
        return project;
      }

      if (!allowedTransitions.includes(finalStatus)) {
        throw new AppError(
          `Cannot transition project from ${currentStatus} to ${finalStatus}`,
          400
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
          400
        );
      }

      const updateData = buildProjectUpdateData(
        project,
        finalStatus,
        normalizedFeedback,
        adminId
      );

      let userUpdate = null;

      if (finalStatus === PROJECT_STATUS.REJECTED) {
        const coolingPeriodEnd = new Date();
        coolingPeriodEnd.setDate(coolingPeriodEnd.getDate() + 7);
        userUpdate = { coolingPeriodEnd };
      }

      await this._ensureEscrowForFundedProject(
        projectId,
        project.projectType,
        session
      );

      const updatedProject = await this.projectRepository.updateById(
        projectId,
        updateData,
        session
      );

      if (!updatedProject) {
        throw new AppError("Failed to update project status.", 500);
      }

      if (userUpdate) {
        await this.userRepository.updateById(
          extractObjectId(project.organizerId),
          userUpdate,
          session
        );
      }

      if (finalStatus === PROJECT_STATUS.REVISION_REQUESTED && this.jobQueue) {
        this.jobQueue
          .addJob(
            "project-maintenance",
            "check-revision-timeout",
            { projectId },
            { delay: 14 * 24 * 60 * 60 * 1000 }
          )
          .catch((err) =>
            console.error(
              `[Queue] Failed to schedule timeout for ${projectId}`,
              err.message
            )
          );
      }

      if (String(updatedProject?.status) === PROJECT_STATUS.ACTIVE) {
        await this._syncProjectConversationOnActive(updatedProject, adminId);
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

      this._emitProjectStatusUpdated({
        project: updatedProject,
        actorId: adminId,
        feedback: updateData.rejectionReason,
      });

      return updatedProject;
    });
  }
}

export default AdminProjectService;