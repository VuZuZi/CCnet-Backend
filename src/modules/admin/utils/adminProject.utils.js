import { PROJECT_STATUS, PROJECT_TYPE } from "../../project/project.constant.js";

export const APPROVED_PROJECT_STATUSES = [
  PROJECT_STATUS.FUNDING,
  PROJECT_STATUS.RECRUITING,
  PROJECT_STATUS.ACTIVE,
  PROJECT_STATUS.EXECUTING,
];

export const COMPLETED_PROJECT_STATUSES = [
  PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
  PROJECT_STATUS.COMPLETED_PARTIAL,
  PROJECT_STATUS.COMPLETED,
];

export const CANCELLED_PROJECT_STATUSES = [
  PROJECT_STATUS.CANCELLED_BY_PLATFORM,
  PROJECT_STATUS.CANCELLED_BY_ORGANIZER,
  PROJECT_STATUS.CANCELLED_FRAUD,
  PROJECT_STATUS.CANCELLED,
];

export const REVIEWABLE_PROJECT_STATUSES = [
  PROJECT_STATUS.PENDING_APPROVAL,
  PROJECT_STATUS.REVISION_REQUESTED,
  PROJECT_STATUS.UNDER_REVIEW,
];

export function normalizeProjectStatus(status) {
  return String(status || "").trim().toUpperCase();
}

export function extractObjectId(value) {
  if (!value) return null;
  return typeof value === "object" ? value?._id || null : value;
}

export function getApprovedStatusForProject(project) {
  return project?.projectType === PROJECT_TYPE.FUNDED
    ? PROJECT_STATUS.FUNDING
    : PROJECT_STATUS.RECRUITING;
}

export function getResumeStatusForProject(project) {
  return project?.projectType === PROJECT_TYPE.FUNDED
    ? PROJECT_STATUS.FUNDING
    : PROJECT_STATUS.RECRUITING;
}

export function mapIncomingProjectStatus(project, rawStatus) {
  const normalized = normalizeProjectStatus(rawStatus);

  if (normalized === "PENDING") {
    return PROJECT_STATUS.PENDING_APPROVAL;
  }

  if (normalized === "APPROVED" || normalized === "ACTIVE") {
    return getApprovedStatusForProject(project);
  }

  if (normalized === "COMPLETED") {
    return PROJECT_STATUS.COMPLETED_SUCCESSFULLY;
  }

  if (normalized === "CANCELLED") {
    return PROJECT_STATUS.CANCELLED_BY_PLATFORM;
  }

  return normalized;
}

export function getAllowedProjectTransitions(project) {
  const currentStatus = normalizeProjectStatus(project?.status);

  switch (currentStatus) {
    case PROJECT_STATUS.PENDING_APPROVAL:
    case PROJECT_STATUS.REVISION_REQUESTED:
    case PROJECT_STATUS.UNDER_REVIEW:
      return [
        getApprovedStatusForProject(project),
        PROJECT_STATUS.REVISION_REQUESTED,
        PROJECT_STATUS.REJECTED,
      ];

    case PROJECT_STATUS.FUNDING:
    case PROJECT_STATUS.RECRUITING:
    case PROJECT_STATUS.ACTIVE:
    case PROJECT_STATUS.EXECUTING:
      return [
        PROJECT_STATUS.PAUSED,
        PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
        PROJECT_STATUS.CANCELLED_BY_PLATFORM,
      ];

    case PROJECT_STATUS.PAUSED:
      return [
        getResumeStatusForProject(project),
        PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
        PROJECT_STATUS.CANCELLED_BY_PLATFORM,
      ];

    default:
      return [];
  }
}

export function buildProjectActionName(fromStatus, toStatus) {
  const normalizedFrom = normalizeProjectStatus(fromStatus);
  const normalizedTo = normalizeProjectStatus(toStatus);

  if (
    REVIEWABLE_PROJECT_STATUSES.includes(normalizedFrom) &&
    [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(normalizedTo)
  ) {
    return "APPROVE_PROJECT";
  }

  if (normalizedTo === PROJECT_STATUS.REVISION_REQUESTED) {
    return "REQUEST_PROJECT_REVISION";
  }

  if (normalizedTo === PROJECT_STATUS.REJECTED) {
    return "REJECT_PROJECT";
  }

  if (normalizedTo === PROJECT_STATUS.PAUSED) {
    return "PAUSE_PROJECT";
  }

  if (
    [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(normalizedTo) &&
    normalizedFrom === PROJECT_STATUS.PAUSED
  ) {
    return "RESUME_PROJECT";
  }

  if (COMPLETED_PROJECT_STATUSES.includes(normalizedTo)) {
    return "COMPLETE_PROJECT";
  }

  if (CANCELLED_PROJECT_STATUSES.includes(normalizedTo)) {
    return "CANCEL_PROJECT";
  }

  return "UPDATE_PROJECT_STATUS";
}

export function buildProjectUpdateData(project, finalStatus, feedback, adminId) {
  const updateData = {
    status: finalStatus,
  };

  if ([PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(finalStatus)) {
    updateData.approvedBy = adminId;
    updateData.approvedAt = new Date();
    updateData.rejectionReason = null;
  }

  if (finalStatus === PROJECT_STATUS.REVISION_REQUESTED) {
    updateData.revisionCount = Number(project?.revisionCount || 0) + 1;
    updateData.rejectionReason = feedback;
    updateData.revisionRequestedAt = new Date();
  }

  if (finalStatus === PROJECT_STATUS.REJECTED) {
    updateData.rejectionReason = feedback;
  }

  if (
    [
      PROJECT_STATUS.PENDING_APPROVAL,
      PROJECT_STATUS.UNDER_REVIEW,
      PROJECT_STATUS.PAUSED,
      PROJECT_STATUS.COMPLETED_SUCCESSFULLY,
      PROJECT_STATUS.CANCELLED_BY_PLATFORM,
    ].includes(finalStatus)
  ) {
    updateData.rejectionReason = feedback || null;
  }

  return updateData;
}

export function isApproveAction(currentStatus, finalStatus) {
  return (
    REVIEWABLE_PROJECT_STATUSES.includes(
      normalizeProjectStatus(currentStatus)
    ) &&
    [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING].includes(
      normalizeProjectStatus(finalStatus)
    )
  );
}

export function buildProjectStatusNotificationMessage(
  projectTitle,
  status,
  feedback = ""
) {
  if (APPROVED_PROJECT_STATUSES.includes(status)) {
    return {
      title: "Project approved",
      message: `Your project "${projectTitle}" has been approved and is now active with status ${status}.`,
    };
  }

  if (status === PROJECT_STATUS.REVISION_REQUESTED) {
    return {
      title: "Project revision requested",
      message: `Your project "${projectTitle}" requires revision. Reason: ${feedback}. You have 14 days to update it.`,
    };
  }

  if (status === PROJECT_STATUS.REJECTED) {
    return {
      title: "Project rejected",
      message: `Your project "${projectTitle}" has been rejected. Reason: ${feedback}. Your account is blocked from creating new projects for 7 days.`,
    };
  }

  if (status === PROJECT_STATUS.PAUSED) {
    return {
      title: "Project paused",
      message: `Your project "${projectTitle}" has been paused. Reason: ${feedback || "No reason provided"}.`,
    };
  }

  if (COMPLETED_PROJECT_STATUSES.includes(status)) {
    return {
      title: "Project completed",
      message: `Your project "${projectTitle}" has been marked as completed. Note: ${feedback || "No note provided"}.`,
    };
  }

  if (CANCELLED_PROJECT_STATUSES.includes(status)) {
    return {
      title: "Project cancelled",
      message: `Your project "${projectTitle}" has been cancelled. Reason: ${feedback || "No reason provided"}.`,
    };
  }

  if (
    status === PROJECT_STATUS.PENDING_APPROVAL ||
    status === PROJECT_STATUS.UNDER_REVIEW
  ) {
    return {
      title: "Project submitted for review",
      message: `Your project "${projectTitle}" has been moved to review status. Note: ${feedback || "No note provided"}.`,
    };
  }

  return {
    title: "Project status updated",
    message: `The status of project "${projectTitle}" has been updated to ${status}.`,
  };
}