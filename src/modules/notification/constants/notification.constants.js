export const NOTIFICATION_TYPES = Object.freeze({
  FOLLOW_CREATED: 'follow_created',
  PROJECT_UPDATED: 'project_updated',
  ORGANIZER_REQUEST_SUBMITTED: 'organizer_request_submitted',
  ORGANIZER_REQUEST_UPDATED: 'organizer_request_updated',
  SYSTEM_ANNOUNCEMENT: 'system_announcement',

  HELP_REQUEST_ASSIGNED: 'help_request_assigned',
  HELP_REQUEST_REASSIGNED: 'help_request_reassigned',
  HELP_REQUEST_VERIFIED: 'help_request_verified',
  HELP_REQUEST_REJECTED: 'help_request_rejected',
  HELP_REQUEST_COMPLETED: 'help_request_completed',
  HELP_REQUEST_ASSIGNMENT_RESPONDED: 'help_request_assignment_responded',

  KYC_EXPIRING_WARNING: 'kyc.expiringWarning',
  KYC_EXPIRED: 'kyc.expired',
  KYC_GRACE_PERIOD_ENDED: 'kyc.gracePeriodEnded',

  DONATION_SUCCESSFUL: 'donation_successful',

  REFUND_REQUEST_SUBMITTED: 'refund_request_submitted',
  TRANSACTION_REFUNDED: 'transaction_refunded',
  REFUND_REQUEST_REJECTED: 'refund_request_rejected',
  TRANSACTION_WITHDRAWAL_REQUESTED: 'transaction_withdrawal_requested',
  TRANSACTION_FAILED: 'transaction_failed',

  POST_REACTED: 'post_reacted',
  POST_COMMENTED: 'post_commented',
  COMMENT_REPLIED: 'comment_replied',
  COMMENT_REACTED: 'comment_reacted',
  MESSAGE_REACTED: 'message_reacted',

  VOLUNTEER_APPLIED: 'volunteer_applied',
  VOLUNTEER_APPLICATION_APPROVED: 'volunteer_application_approved',
  VOLUNTEER_APPLICATION_REJECTED: 'volunteer_application_rejected',

  VOLUNTEER_WITHDRAW_REQUESTED: 'volunteer_withdraw_requested',
  VOLUNTEER_WITHDRAW_APPROVED: 'volunteer_withdraw_approved',
  VOLUNTEER_WITHDRAW_REJECTED: 'volunteer_withdraw_rejected',

  VOLUNTEER_REVIEW_REQUIRED: 'volunteer_review_required',
  VOLUNTEER_REVIEW_SUBMITTED: 'volunteer_review_submitted',
  VOLUNTEER_REVIEW_AUTO_MAXED: 'volunteer_review_auto_maxed',
});

export const NOTIFICATION_CHANNELS = Object.freeze({
  IN_APP: 'in_app',
});

export const NOTIFICATION_SSE_EVENTS = Object.freeze({
  CONNECTED: 'notification.connected',
  CREATED: 'notification.created',
  READ: 'notification.read',
  READ_ALL: 'notification.read_all',
  DELETED: 'notification.deleted',
  UNREAD_COUNT: 'notification.unread_count',
  HEARTBEAT: 'notification.heartbeat',
});

export const NOTIFICATION_DEFAULTS = Object.freeze({
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 50,
  SSE_RETRY_MS: 10000,
  SSE_HEARTBEAT_MS: 25000,
  SSE_SESSION_TTL_MS: 60 * 1000,
  SSE_COOKIE_NAME: 'notification_stream',
  SSE_COOKIE_PATH: '/api/v1/notifications/stream/events',
  BROADCAST_BATCH_SIZE: 50,
});

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  systemEnabled: true,
  followEnabled: true,
  projectEnabled: true,
  organizerRequestEnabled: true,
  helpRequestEnabled: true,
  postEnabled: true,
});
