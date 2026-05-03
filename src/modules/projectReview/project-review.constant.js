import { PROJECT_AI_REVIEW_STATUS } from "../projectAIReview/project-ai-review.constant.js";

export const PROJECT_REVIEW_DECISION = Object.freeze({
  APPROVED: "APPROVED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  REJECTED: "REJECTED",
});

export const PROJECT_REVIEW_TRANSITION_AUDIT_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPLIED: "APPLIED",
  FAILED: "FAILED",
  CONFLICT: "CONFLICT",
});

export const PROJECT_REVIEW_AI_STATE_AT_DECISION = Object.freeze({
  COMPLETED: PROJECT_AI_REVIEW_STATUS.COMPLETED,
  PENDING: PROJECT_AI_REVIEW_STATUS.PENDING,
  RUNNING: PROJECT_AI_REVIEW_STATUS.RUNNING,
  FAILED: PROJECT_AI_REVIEW_STATUS.FAILED,
  STALE: PROJECT_AI_REVIEW_STATUS.STALE,
  NONE: "NONE",
});

export const PROJECT_REVIEW_CHECKLIST_KEYS = Object.freeze([
  "beneficiary_clear",
  "budget_clear",
  "funded_milestones_cost_clarity",
  "goods_have_delivery_followup",
  "evidence_plan_sufficient",
  "timeline_location_feasible",
  "organizer_trust_reviewed",
  "documents_media_reviewed",
  "ai_reviewed_or_bypassed",
  "approval_consequences_acknowledged",
]);

export const REQUIRED_APPROVAL_CHECKLIST_KEYS = PROJECT_REVIEW_CHECKLIST_KEYS;

export const MANUAL_AI_BYPASS_WARNING_EXACT =
  "B\u00e1o c\u00e1o AI ch\u01b0a s\u1eb5n s\u00e0ng ho\u1eb7c kh\u00f4ng h\u1ee3p l\u1ec7. B\u1ea1n x\u00e1c nh\u1eadn \u0111\u00e3 ki\u1ec3m duy\u1ec7t th\u1ee7 c\u00f4ng tr\u01b0\u1edbc khi ph\u00ea duy\u1ec7t.";

export const MANUAL_AI_BYPASS_WARNING =
  "Báo cáo AI chưa sẵn sàng hoặc không hợp lệ. Bạn xác nhận đã kiểm duyệt thủ công trước khi phê duyệt.";
