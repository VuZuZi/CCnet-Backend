import mongoose from "mongoose";
import {
  PROJECT_REVIEW_AI_STATE_AT_DECISION,
  PROJECT_REVIEW_DECISION,
  PROJECT_REVIEW_TRANSITION_AUDIT_STATUS,
} from "./project-review.constant.js";

const projectReviewRecordSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    submissionVersion: { type: Number, required: true, min: 1 },
    decision: {
      type: String,
      enum: Object.values(PROJECT_REVIEW_DECISION),
      required: true,
      index: true,
    },
    statusBefore: { type: String, required: true, trim: true },
    statusAfter: { type: String, default: null, trim: true },
    transitionAuditStatus: {
      type: String,
      enum: Object.values(PROJECT_REVIEW_TRANSITION_AUDIT_STATUS),
      default: PROJECT_REVIEW_TRANSITION_AUDIT_STATUS.PENDING,
      index: true,
    },
    transitionAttemptedAt: { type: Date, default: null },
    transitionAppliedAt: { type: Date, default: null },
    transitionFailedAt: { type: Date, default: null },
    transitionErrorCode: { type: String, default: null, trim: true },
    transitionErrorMessageSafe: { type: String, default: null, trim: true, maxlength: 1000 },
    checklistSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    reason: { type: String, default: "", trim: true },
    feedback: { type: String, default: "", trim: true },
    aiReviewRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectAIReviewRun",
      default: null,
    },
    aiReviewSummarySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    projectSnapshotHash: { type: String, required: true, trim: true },
    approvedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    decisionSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    manualAiBypassAcknowledged: { type: Boolean, default: false },
    manualAiBypassReason: { type: String, default: "", trim: true },
    aiStateAtDecision: {
      type: String,
      enum: Object.values(PROJECT_REVIEW_AI_STATE_AT_DECISION),
      required: true,
    },
    actorMetadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

projectReviewRecordSchema.index({ projectId: 1, createdAt: -1 });
projectReviewRecordSchema.index({ adminId: 1, createdAt: -1 });
projectReviewRecordSchema.index({ decision: 1, createdAt: -1 });

const ALLOWED_AUDIT_UPDATE_FIELDS = new Set([
  "statusAfter",
  "transitionAuditStatus",
  "transitionAttemptedAt",
  "transitionAppliedAt",
  "transitionFailedAt",
  "transitionErrorCode",
  "transitionErrorMessageSafe",
  "approvedSnapshot",
  "decisionSnapshot",
]);

projectReviewRecordSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"],
  function blockReviewRecordMutation(next) {
    const update = this.getUpdate?.() || {};
    const setKeys = Object.keys(update.$set || {});
    const otherKeys = Object.keys(update).filter((key) => key !== "$set");

    if (
      setKeys.length > 0 &&
      otherKeys.length === 0 &&
      setKeys.every((key) => ALLOWED_AUDIT_UPDATE_FIELDS.has(key))
    ) {
      return next();
    }

    next(new Error("ProjectReviewRecord is immutable"));
  }
);

projectReviewRecordSchema.pre(
  ["deleteOne", "deleteMany"],
  function blockReviewRecordDelete(next) {
    next(new Error("ProjectReviewRecord is immutable"));
  }
);

const ProjectReviewRecord =
  mongoose.models.ProjectReviewRecord ||
  mongoose.model("ProjectReviewRecord", projectReviewRecordSchema);

export default ProjectReviewRecord;
