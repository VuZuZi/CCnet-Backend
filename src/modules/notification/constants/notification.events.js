export const DOMAIN_EVENTS = Object.freeze({
  FOLLOW_CREATED: 'follow.created',

  PROJECT_UPDATED: 'project.updated',
  PROJECT_SUBMITTED_FOR_APPROVAL: 'project.submittedForApproval',
  PROJECT_STATUS_UPDATED: 'project.statusUpdated',

  ORGANIZER_REQUEST_SUBMITTED: 'organizerRequest.submitted',
  ORGANIZER_REQUEST_UPDATED: 'organizerRequest.updated',

  SYSTEM_ANNOUNCEMENT_CREATED: 'systemAnnouncement.created',

  DONATION_SUCCESSFUL: 'donation.successful',
  TRANSACTION_REFUNDED: 'transaction.refunded',
  TRANSACTION_WITHDRAWAL_REQUESTED: 'transaction.withdrawalRequested',
  TRANSACTION_FAILED: 'transaction.failed',

  POST_REACTED: 'post.reacted',
  POST_COMMENTED: 'post.commented',
});