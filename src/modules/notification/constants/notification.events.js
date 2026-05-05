export const DOMAIN_EVENTS = Object.freeze({
  FOLLOW_CREATED: 'follow.created',
  SYSTEM_ANNOUNCEMENT_CREATED: 'system.announcement_created',
  SYSTEM_NOTIFICATION: 'system.notification',

  PROJECT_UPDATED: 'project.updated',
  PROJECT_SUBMITTED_FOR_APPROVAL: 'project.submitted_for_approval',
  PROJECT_STATUS_UPDATED: 'project.status_updated',
  PROJECT_REVIEW_DECIDED: 'project.review_decided',
  PROJECT_MILESTONE_COMPLETED: 'project.milestone_completed',
  PROJECT_COMPLETION_SYNCED: 'project.completion_synced',

  PROJECT_REVIEW_SUBMITTED_TO_ADMINS: 'project.review_submitted_to_admins',
  PROJECT_RESUBMITTED_FOR_APPROVAL: 'project.resubmitted_for_approval',
  PROJECT_AI_REVIEW_COMPLETED: 'project.ai_review_completed',
  PROJECT_AI_REVIEW_FAILED: 'project.ai_review_failed',
  EVIDENCE_SUBMITTED_MANUAL: 'evidence.submitted_manual',

  ORGANIZER_REQUEST_SUBMITTED: 'organizer_request.submitted',
  ORGANIZER_REQUEST_UPDATED: 'organizer_request.updated',
  ORGANIZER_REQUEST_APPROVED: 'organizer_request.approved',
  ORGANIZER_REQUEST_DECLINED: 'organizer_request.declined',

  HELP_REQUEST_ASSIGNED: 'help_request.assigned',
  HELP_REQUEST_REASSIGNED: 'help_request.reassigned',
  HELP_REQUEST_VERIFIED: 'help_request.verified',
  HELP_REQUEST_REJECTED: 'help_request.rejected',
  HELP_REQUEST_COMPLETED: 'help_request.completed',
  HELP_REQUEST_ASSIGNMENT_RESPONDED: 'help_request.assignment_responded',

  KYC_EXPIRING_WARNING: 'kyc.expiringWarning',
  KYC_EXPIRED: 'kyc.expired',
  KYC_GRACE_PERIOD_ENDED: 'kyc.gracePeriodEnded',

  DONATION_SUCCESSFUL: 'donation.successful',
  EVIDENCE_AUTO_APPROVED_GPS: 'evidence.auto_approved_gps',
  EVIDENCE_REVIEWED: 'evidence.reviewed',

  DISBURSEMENT_REQUESTED: 'disbursement.requested',
  DISBURSEMENT_STATUS_CHANGED: 'disbursement.status_changed',

  REFUND_REQUEST_SUBMITTED: 'refund_request.submitted',
  TRANSACTION_REFUND_REQUESTED: 'refund_request.submitted',
  TRANSACTION_REFUNDED: 'transaction.refunded',
  REFUND_REQUEST_REJECTED: 'refund_request.rejected',
  TRANSACTION_REFUND_REJECTED: 'refund_request.rejected',
  TRANSACTION_WITHDRAWAL_REQUESTED: 'transaction.withdrawal_requested',
  TRANSACTION_FAILED: 'transaction.failed',

  POST_REACTED: 'post.reacted',
  POST_COMMENTED: 'post.commented',
  COMMENT_REPLIED: 'comment.replied',
  COMMENT_REACTED: 'comment.reacted',

  VOLUNTEER_APPLIED: 'volunteer.applied',
  VOLUNTEER_APPLICATION_APPROVED: 'volunteer.application_approved',
  VOLUNTEER_APPLICATION_REJECTED: 'volunteer.application_rejected',

  VOLUNTEER_WITHDRAW_REQUESTED: 'volunteer.withdraw_requested',
  VOLUNTEER_WITHDRAW_APPROVED: 'volunteer.withdraw_approved',
  VOLUNTEER_WITHDRAW_REJECTED: 'volunteer.withdraw_rejected',
});
