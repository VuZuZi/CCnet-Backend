import mongoose from "mongoose";
import {
  AI_REVIEW_BLOCKING_LEVELS,
  AI_REVIEW_CHECKLIST_STATES,
  AI_REVIEW_FINDING_LENSES,
  AI_REVIEW_FINDING_SEVERITIES,
  AI_REVIEW_RISK_LEVELS,
  AI_REVIEW_SECTIONS,
  AI_REVIEW_TARGET_TYPES,
  PROJECT_AI_REVIEW_STATUS,
} from "./project-ai-review.constant.js";

const findingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    lens: { type: String, enum: AI_REVIEW_FINDING_LENSES, required: true },
    severity: { type: String, enum: AI_REVIEW_FINDING_SEVERITIES, required: true },
    section: { type: String, enum: AI_REVIEW_SECTIONS, required: true },
    targetType: { type: String, enum: AI_REVIEW_TARGET_TYPES, required: true },
    targetId: { type: String, default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    detail: { type: String, required: true, trim: true, maxlength: 2000 },
    suggestedAdminQuestion: { type: String, required: true, trim: true, maxlength: 1000 },
    suggestedRevisionText: { type: String, default: null, trim: true, maxlength: 2000 },
    evidenceNeeded: { type: [String], default: [] },
    blockingLevel: { type: String, enum: AI_REVIEW_BLOCKING_LEVELS, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
  },
  { _id: false }
);

const checklistSuggestionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    labelKey: { type: String, required: true, trim: true },
    suggestedState: { type: String, enum: AI_REVIEW_CHECKLIST_STATES, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    sourceFindingIds: { type: [String], default: [] },
  },
  { _id: false }
);

const projectAIReviewRunSchema = new mongoose.Schema(
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
    submissionVersion: { type: Number, required: true, min: 1 },
    projectSnapshotHash: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: Object.values(PROJECT_AI_REVIEW_STATUS),
      default: PROJECT_AI_REVIEW_STATUS.PENDING,
      index: true,
    },
    provider: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    promptVersion: { type: String, required: true, trim: true },
    overallRiskLevel: { type: String, enum: AI_REVIEW_RISK_LEVELS, default: null },
    overallRiskScore: { type: Number, min: 0, max: 100, default: null },
    confidence: { type: Number, min: 0, max: 1, default: null },
    summary: { type: String, default: "", trim: true, maxlength: 4000 },
    findings: { type: [findingSchema], default: [] },
    checklistSuggestions: { type: [checklistSuggestionSchema], default: [] },
    normalizedOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    sanitizedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    errorCode: { type: String, default: null, trim: true },
    errorMessageSafe: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

projectAIReviewRunSchema.index({
  projectId: 1,
  submissionVersion: -1,
  createdAt: -1,
});
projectAIReviewRunSchema.index({ projectId: 1, status: 1 });
projectAIReviewRunSchema.index({ status: 1, createdAt: 1 });

const ProjectAIReviewRun =
  mongoose.models.ProjectAIReviewRun ||
  mongoose.model("ProjectAIReviewRun", projectAIReviewRunSchema);

export default ProjectAIReviewRun;
