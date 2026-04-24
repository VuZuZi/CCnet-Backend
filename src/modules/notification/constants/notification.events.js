export const DOMAIN_EVENTS = Object.freeze({
  FOLLOW_CREATED: 'follow.created',

  PROJECT_UPDATED: 'project.updated',
  PROJECT_SUBMITTED_FOR_APPROVAL: 'project.submittedForApproval',
  PROJECT_STATUS_UPDATED: 'project.statusUpdated',
  PROJECT_MILESTONE_COMPLETED: 'project.milestoneCompleted',
  PROJECT_FUNDING_COMPLETED: 'project.fundingCompleted',

  EVIDENCE_SUBMITTED_MANUAL: 'evidence.submittedManual',

  ORGANIZER_REQUEST_SUBMITTED: 'organizerRequest.submitted',
  ORGANIZER_REQUEST_UPDATED: 'organizerRequest.updated',

  SYSTEM_ANNOUNCEMENT_CREATED: 'systemAnnouncement.created',
  SYSTEM_NOTIFICATION: 'system.notification',

  DONATION_SUCCESSFUL: 'donation.successful',
  TRANSACTION_REFUND_REQUESTED: 'transaction.refundRequested',
  TRANSACTION_REFUNDED: 'transaction.refunded',
  TRANSACTION_REFUND_REJECTED: 'transaction.refundRejected',
  TRANSACTION_WITHDRAWAL_REQUESTED: 'transaction.withdrawalRequested',
  TRANSACTION_FAILED: 'transaction.failed',
  REFUND_COMPLETED: "transaction.refundCompleted",

  POST_REACTED: 'post.reacted',
  POST_COMMENTED: 'post.commented',
  COMMENT_REPLIED: 'comment.replied',
  COMMENT_REACTED: 'comment.reacted',
  MESSAGE_REACTED: 'message.reacted',
});
