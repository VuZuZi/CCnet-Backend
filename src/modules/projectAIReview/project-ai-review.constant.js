export const PROJECT_AI_REVIEW_STATUS = Object.freeze({
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  STALE: "STALE",
  CANCELLED: "CANCELLED",
});

export const PROJECT_AI_REVIEW_QUEUE = "project-ai-review";

export const PROJECT_AI_REVIEW_JOB = Object.freeze({
  RUN: "run-project-review",
  RETRY: "retry-project-review",
});

export const PROJECT_AI_REVIEW_PROMPT_VERSION = "project-review-v1";

export const AI_REVIEW_RISK_LEVELS = Object.freeze([
  "low",
  "medium",
  "high",
  "critical",
]);

export const AI_REVIEW_FINDING_LENSES = Object.freeze([
  "completeness",
  "legitimacy",
  "feasibility",
  "budget",
  "milestone_logic",
  "evidence_plan",
  "organizer_trust",
  "policy_safety",
]);

export const AI_REVIEW_FINDING_SEVERITIES = Object.freeze([
  "info",
  "needs_review",
  "warning",
  "critical",
]);

export const AI_REVIEW_SECTIONS = Object.freeze([
  "project_summary",
  "beneficiary",
  "budget",
  "milestones",
  "evidence",
  "timeline",
  "organizer",
  "policy",
]);

export const AI_REVIEW_TARGET_TYPES = Object.freeze([
  "project",
  "beneficiary",
  "budget",
  "milestone",
  "document",
  "timeline",
  "organizer",
  "policy",
]);

export const AI_REVIEW_BLOCKING_LEVELS = Object.freeze([
  "none",
  "review_required",
  "must_fix_before_approval",
]);

export const AI_REVIEW_CHECKLIST_STATES = Object.freeze([
  "unchecked",
  "needs_review",
  "checked",
]);

export const PROJECT_AI_REVIEW_ERROR_CODE = Object.freeze({
  AI_PROVIDER_NOT_CONFIGURED: "AI_PROVIDER_NOT_CONFIGURED",
  AI_PROVIDER_INVALID: "AI_PROVIDER_INVALID",
  AI_QUEUE_ENQUEUE_FAILED: "AI_QUEUE_ENQUEUE_FAILED",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  PROVIDER_FAILED: "PROVIDER_FAILED",
  AI_OUTPUT_INVALID: "AI_OUTPUT_INVALID",
  STALE_SNAPSHOT: "STALE_SNAPSHOT",
  RUN_NOT_PENDING: "RUN_NOT_PENDING",
});

export const FORBIDDEN_AI_DECISION_PATTERNS = Object.freeze([
  // Vietnamese: AI claims to make final decision
  /ai\s*duy\u1ec7t/i,
  /ai\s*x\u00e1c minh/i,
  /ai\s*\u0111\u1ea3m b\u1ea3o/i,
  /ai\s*quy\u1ebft \u0111\u1ecbnh/i,
  /ai\s*(duyet|duyệt)/i,
  /ai\s*(xac minh|xác minh)/i,
  /ai\s*(dam bao|đảm bảo)/i,
  /ai\s*(quyet dinh|quyết định)/i,
  // English: AI/I/we making or recommending final decision
  /\b(i|we|ai)\s+(approve|reject|approved|rejected)\b/i,
  /\bproject\s+is\s+(approved|rejected)\b/i,
  /\bthis\s+project\s+should\s+be\s+(approved|rejected)\b/i,
  /\brecommend\s+(approving|rejecting|approval|rejection)\b/i,
  /\b(i|we)\s+recommend\s+(to\s+)?(approve|reject)\b/i,
  // Vietnamese: recommendation phrasing where AI is the decision-maker
  /\b(tôi|chúng tôi|AI)\s+(đề nghị|khuyến nghị)\s*(phê duyệt|từ chối)/i,
]);
