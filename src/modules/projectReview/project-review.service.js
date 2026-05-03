import AppError from "../../core/AppError.js";
import { randomUUID } from "crypto";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import { AGREEMENT_SUBJECT_TYPE } from "../agreementRecord/agreementRecord.constant.js";
import {
  MANUAL_AI_BYPASS_WARNING_EXACT,
  PROJECT_REVIEW_AI_STATE_AT_DECISION,
  PROJECT_REVIEW_CHECKLIST_KEYS,
  PROJECT_REVIEW_DECISION,
  PROJECT_REVIEW_TRANSITION_AUDIT_STATUS,
  REQUIRED_APPROVAL_CHECKLIST_KEYS,
} from "./project-review.constant.js";
import { projectDecisionSchema } from "./project-review.validation.js";
import {
  buildProjectReviewSnapshot,
  hashProjectReviewSnapshot,
} from "../projectAIReview/project-review-snapshot.js";
import { PROJECT_AI_REVIEW_STATUS } from "../projectAIReview/project-ai-review.constant.js";

const normalizeId = (value) => String(value?._id || value || "");

const safeAuditErrorMessage = (message) =>
  String(message || "Project review transition failed.").slice(0, 500);

const getOrganizer = (project) =>
  project?.organizerId && typeof project.organizerId === "object"
    ? project.organizerId
    : null;

class ProjectReviewService {
  constructor({
    adminProjectService,
    adminProjectRepository,
    projectRepository,
    projectAIReviewService,
    projectAIReviewRepository,
    projectReviewRecordRepository,
    agreementRecordRepository,
    eventBus = null,
    winstonLogger,
  }) {
    this.adminProjectService = adminProjectService;
    this.adminProjectRepository = adminProjectRepository;
    this.projectRepository = projectRepository;
    this.projectAIReviewService = projectAIReviewService;
    this.projectAIReviewRepository = projectAIReviewRepository;
    this.projectReviewRecordRepository = projectReviewRecordRepository;
    this.agreementRecordRepository = agreementRecordRepository;
    this.eventBus = eventBus;
    this.logger = winstonLogger?.getLogger?.() || console;
  }

  buildChecklistDefaults() {
    return PROJECT_REVIEW_CHECKLIST_KEYS.reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {});
  }

  async buildOrganizerTrustContext(project) {
    const organizer = getOrganizer(project);
    let agreement = null;

    const agreementSubjectId = organizer?.organization?.requestId;
    if (agreementSubjectId && this.agreementRecordRepository) {
      agreement = await this.agreementRecordRepository.findBySubject(
        AGREEMENT_SUBJECT_TYPE.ORGANIZER_ONBOARDING,
        agreementSubjectId
      );
    }

    const priorHistory = await this.projectRepository.getOrganizerReviewContext(
      normalizeId(project.organizerId),
      normalizeId(project._id)
    );

    return {
      kyc: organizer?.kyc
        ? {
            status: organizer.kyc.status || null,
            tier: Number(organizer.kyc.tier || 0),
            verifiedAt: organizer.kyc.verifiedAt || null,
            expiresAt: organizer.kyc.expiresAt || null,
          }
        : { unavailable: true },
      organizerProfile: organizer
        ? {
            fullName: organizer.fullName || "",
            email: organizer.email || "",
            phone: organizer.phone || "",
            organization: organizer.organization || null,
          }
        : { unavailable: true },
      responsibilityAgreement: agreement
        ? {
            version: agreement.version,
            status: agreement.status,
            signedAt: agreement.signedAt,
            isSealed: Boolean(agreement.isSealed),
          }
        : { unavailable: true },
      priorProjectHistory: priorHistory || { unavailable: true },
    };
  }

  async getAdminReview(projectId) {
    let project = await this.adminProjectRepository.findProjectById(projectId);
    if (!project) {
      throw new AppError("Project not found.", 404);
    }

    const organizerTrust = await this.buildOrganizerTrustContext(project);
    const snapshot = buildProjectReviewSnapshot(project, organizerTrust);
    const projectSnapshotHash = hashProjectReviewSnapshot(snapshot);
    const submissionVersion = Math.max(
      1,
      Number(project.submissionVersion || 0) || 1
    );

    if (
      Number(project.submissionVersion || 0) !== submissionVersion ||
      project.projectSnapshotHash !== projectSnapshotHash
    ) {
      project = await this.projectRepository.updateReviewMetadata(project._id, {
        submissionVersion,
        projectSnapshotHash,
      });
      project = await this.adminProjectRepository.findProjectById(projectId);
    }

    const [latestAIReviewRun, aiReviewRuns, reviewRecords] = await Promise.all([
      this.projectAIReviewRepository.findLatestCurrent(
        projectId,
        submissionVersion,
        projectSnapshotHash
      ),
      this.projectAIReviewRepository.findByProject(projectId),
      this.projectReviewRecordRepository.findByProject(projectId),
    ]);

    return {
      project,
      organizerTrust,
      submissionVersion,
      projectSnapshotHash,
      snapshot,
      checklistDefaults: this.buildChecklistDefaults(),
      latestAIReviewRun,
      aiReviewRuns,
      reviewRecords,
      manualAiBypassWarning: MANUAL_AI_BYPASS_WARNING_EXACT,
    };
  }

  async listAIReviewRuns(projectId) {
    return this.projectAIReviewRepository.findByProject(projectId);
  }

  async getLatestAIReviewRun(projectId) {
    const review = await this.getAdminReview(projectId);
    return review.latestAIReviewRun || null;
  }

  async retryAIReview(projectId) {
    return this.projectAIReviewService.retryProjectReview(projectId);
  }

  async listReviewRecords(projectId) {
    return this.projectReviewRecordRepository.findByProject(projectId);
  }

  assertChecklistComplete(checklist) {
    const missing = REQUIRED_APPROVAL_CHECKLIST_KEYS.filter(
      (key) => checklist?.[key] !== true
    );

    if (missing.length) {
      throw new AppError("Approval checklist is incomplete.", 400, { missing });
    }
  }

  resolveAIStateAtDecision(aiRun, submissionVersion, projectSnapshotHash) {
    if (!aiRun) return PROJECT_REVIEW_AI_STATE_AT_DECISION.NONE;

    if (
      Number(aiRun.submissionVersion) !== Number(submissionVersion) ||
      aiRun.projectSnapshotHash !== projectSnapshotHash ||
      aiRun.status === PROJECT_AI_REVIEW_STATUS.STALE
    ) {
      return PROJECT_REVIEW_AI_STATE_AT_DECISION.STALE;
    }

    if (aiRun.status === PROJECT_AI_REVIEW_STATUS.COMPLETED) {
      return PROJECT_REVIEW_AI_STATE_AT_DECISION.COMPLETED;
    }

    if (aiRun.status === PROJECT_AI_REVIEW_STATUS.RUNNING) {
      return PROJECT_REVIEW_AI_STATE_AT_DECISION.RUNNING;
    }

    if (aiRun.status === PROJECT_AI_REVIEW_STATUS.FAILED) {
      return PROJECT_REVIEW_AI_STATE_AT_DECISION.FAILED;
    }

    return PROJECT_REVIEW_AI_STATE_AT_DECISION.PENDING;
  }

  _buildReviewRecordPayload({
    projectId,
    project,
    adminId,
    review,
    parsed,
    feedback,
    currentStatus,
    statusAfter,
    transitionAuditStatus,
    decidedAt,
    selectedAIRun,
    aiReviewSummarySnapshot,
    aiStateAtDecision,
    actorMetadata,
    approvedSnapshot = null,
    transitionErrorCode = null,
    transitionErrorMessageSafe = null,
  }) {
    const decisionSnapshot = {
      decision: parsed.decision,
      statusBefore: currentStatus,
      statusAfter: statusAfter || null,
      transitionAuditStatus,
      decidedAt: decidedAt.toISOString(),
    };

    if (transitionAuditStatus === PROJECT_REVIEW_TRANSITION_AUDIT_STATUS.APPLIED) {
      decisionSnapshot.appliedAt = new Date().toISOString();
    } else {
      decisionSnapshot.failedAt = new Date().toISOString();
    }

    return {
      projectId,
      organizerId: normalizeId(project.organizerId),
      adminId,
      submissionVersion: review.submissionVersion,
      decision: parsed.decision,
      statusBefore: currentStatus,
      statusAfter: statusAfter || null,
      transitionAuditStatus,
      transitionAttemptedAt: decidedAt,
      transitionErrorCode,
      transitionErrorMessageSafe,
      checklistSnapshot: {
        ...parsed.checklist,
        manualAiBypassAcknowledged: parsed.manualAiBypassAcknowledged,
        completedAt: decidedAt,
      },
      reason: parsed.reason,
      feedback,
      aiReviewRunId: selectedAIRun?._id || null,
      aiReviewSummarySnapshot,
      projectSnapshotHash: review.projectSnapshotHash,
      approvedSnapshot,
      decisionSnapshot,
      manualAiBypassAcknowledged: parsed.manualAiBypassAcknowledged,
      manualAiBypassReason: parsed.manualAiBypassReason,
      aiStateAtDecision,
      actorMetadata,
    };
  }

  _emitReviewDecisionNotification({
    projectId,
    project,
    updatedProject,
    parsed,
    feedback,
    adminId,
    record,
  }) {
    if (!this.eventBus || typeof this.eventBus.emit !== "function") return;

    const organizerId = normalizeId(project.organizerId);
    if (!organizerId) return;

    this.eventBus.emit(DOMAIN_EVENTS.PROJECT_REVIEW_DECIDED, {
      recipientIds: [organizerId],
      recipientId: organizerId,
      organizerId,
      actorId: adminId,
      projectId,
      projectName: updatedProject?.title || project?.title || "",
      status: updatedProject?.status || parsed.decision,
      decision: parsed.decision,
      reason: parsed.reason || "",
      feedback: feedback || "",
      reviewRecordId: record?._id || null,
      actionUrl: `/projects/${projectId}`,
      metadata: {
        projectId,
        projectName: updatedProject?.title || project?.title || "",
        status: updatedProject?.status || parsed.decision,
        decision: parsed.decision,
        reason: parsed.reason || "",
        feedback: feedback || "",
        reviewRecordId: record?._id || null,
      },
    });
  }

  async decideProject(projectId, payload, adminId, actorMetadata = {}) {
    const parsed = projectDecisionSchema.parse(payload || {});
    const feedback = parsed.feedback || parsed.reason || "";

    if (
      [
        PROJECT_REVIEW_DECISION.REVISION_REQUESTED,
        PROJECT_REVIEW_DECISION.REJECTED,
      ].includes(parsed.decision) &&
      !feedback.trim()
    ) {
      throw new AppError(
        "Reason or feedback is required for this decision.",
        400
      );
    }

    if (parsed.decision === PROJECT_REVIEW_DECISION.APPROVED) {
      this.assertChecklistComplete(parsed.checklist);
    }

    const review = await this.getAdminReview(projectId);
    const project = review.project;
    const currentStatus = String(project.status || "").toUpperCase();

    if (
      currentStatus !== String(parsed.expectedStatus || "").toUpperCase() ||
      Number(review.submissionVersion) !==
        Number(parsed.expectedSubmissionVersion) ||
      review.projectSnapshotHash !== parsed.expectedProjectSnapshotHash
    ) {
      throw new AppError(
        "Project review data is stale. Please refresh the cockpit before deciding.",
        409
      );
    }

    const selectedAIRun = parsed.aiReviewRunId
      ? await this.projectAIReviewRepository.findById(parsed.aiReviewRunId)
      : review.latestAIReviewRun;

    const aiStateAtDecision = this.resolveAIStateAtDecision(
      selectedAIRun,
      review.submissionVersion,
      review.projectSnapshotHash
    );

    if (
      parsed.decision === PROJECT_REVIEW_DECISION.APPROVED &&
      aiStateAtDecision !== PROJECT_REVIEW_AI_STATE_AT_DECISION.COMPLETED &&
      !parsed.manualAiBypassAcknowledged
    ) {
      throw new AppError(MANUAL_AI_BYPASS_WARNING_EXACT, 400);
    }

    const decisionLockId = randomUUID();

    const lockedProject = await this.projectRepository.acquireReviewDecisionLock(
      projectId,
      {
        status: parsed.expectedStatus,
        submissionVersion: parsed.expectedSubmissionVersion,
        projectSnapshotHash: parsed.expectedProjectSnapshotHash,
      },
      {
        lockId: decisionLockId,
        lockedAt: new Date(),
        lockedBy: adminId,
      }
    );

    if (!lockedProject) {
      throw new AppError(
        "Project review data is stale or another decision is in progress. Please reload.",
        409
      );
    }

    const targetStatus =
      parsed.decision === PROJECT_REVIEW_DECISION.APPROVED
        ? "APPROVED"
        : parsed.decision;

    let updatedProject = null;
    let record = null;
    const decidedAt = new Date();

    const aiReviewSummarySnapshot = selectedAIRun
      ? {
          runId: selectedAIRun._id,
          status: selectedAIRun.status,
          overallRiskLevel: selectedAIRun.overallRiskLevel || null,
          overallRiskScore: selectedAIRun.overallRiskScore ?? null,
          confidence: selectedAIRun.confidence ?? null,
          summary: selectedAIRun.summary || "",
        }
      : null;

    try {
      updatedProject = await this.adminProjectService.updateProjectStatus(
        projectId,
        targetStatus,
        feedback,
        adminId,
        {
          expectedStatus: parsed.expectedStatus,
          expectedSubmissionVersion: parsed.expectedSubmissionVersion,
          expectedProjectSnapshotHash: parsed.expectedProjectSnapshotHash,
          expectedReviewDecisionLockId: decisionLockId,
          conflictOnNoop: true,
        }
      );

      const statusAfter = String(updatedProject.status || "").toUpperCase();

      record = await this.projectReviewRecordRepository.create(
        this._buildReviewRecordPayload({
          projectId,
          project,
          adminId,
          review,
          parsed,
          feedback,
          currentStatus,
          statusAfter,
          transitionAuditStatus:
            PROJECT_REVIEW_TRANSITION_AUDIT_STATUS.APPLIED,
          decidedAt,
          selectedAIRun,
          aiReviewSummarySnapshot,
          aiStateAtDecision,
          actorMetadata,
          approvedSnapshot:
            parsed.decision === PROJECT_REVIEW_DECISION.APPROVED
              ? {
                  projectId,
                  title: updatedProject.title,
                  status: updatedProject.status,
                  projectType: updatedProject.projectType,
                  approvedAt: updatedProject.approvedAt,
                }
              : null,
        })
      );

      this._emitReviewDecisionNotification({
        projectId,
        project,
        updatedProject,
        parsed,
        feedback,
        adminId,
        record,
      });

      return { project: updatedProject, reviewRecord: record };
    } catch (error) {
      const transitionAuditStatus =
        Number(error?.statusCode || error?.status) === 409
          ? PROJECT_REVIEW_TRANSITION_AUDIT_STATUS.CONFLICT
          : PROJECT_REVIEW_TRANSITION_AUDIT_STATUS.FAILED;

      try {
        record = await this.projectReviewRecordRepository.create(
          this._buildReviewRecordPayload({
            projectId,
            project,
            adminId,
            review,
            parsed,
            feedback,
            currentStatus,
            statusAfter: null,
            transitionAuditStatus,
            decidedAt,
            selectedAIRun,
            aiReviewSummarySnapshot,
            aiStateAtDecision,
            actorMetadata,
            transitionErrorCode: String(
              error?.statusCode || error?.status || "ERROR"
            ),
            transitionErrorMessageSafe: safeAuditErrorMessage(error?.message),
          })
        );
      } catch (auditError) {
        this.logger?.warn?.("Failed to create failed project review record", {
          projectId: String(projectId),
          errorName: auditError?.name || "Error",
          errorMessage: auditError?.message || "",
        });
      }

      throw error;
    } finally {
      try {
        await this.projectRepository.releaseReviewDecisionLock(
          projectId,
          decisionLockId
        );
      } catch (error) {
        this.logger?.warn?.("Failed to release project review decision lock", {
          projectId: String(projectId),
          errorName: error?.name || "Error",
        });
      }
    }
  }
}

export default ProjectReviewService;