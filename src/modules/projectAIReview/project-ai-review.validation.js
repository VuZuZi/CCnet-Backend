import { z } from "zod";
import {
  AI_REVIEW_BLOCKING_LEVELS,
  AI_REVIEW_CHECKLIST_STATES,
  AI_REVIEW_FINDING_LENSES,
  AI_REVIEW_FINDING_SEVERITIES,
  AI_REVIEW_RISK_LEVELS,
  AI_REVIEW_SECTIONS,
  AI_REVIEW_TARGET_TYPES,
  FORBIDDEN_AI_DECISION_PATTERNS,
  PROJECT_AI_REVIEW_ERROR_CODE,
} from "./project-ai-review.constant.js";
import { PROJECT_REVIEW_CHECKLIST_KEYS } from "../projectReview/project-review.constant.js";

const confidenceSchema = z.number().min(0).max(1);

const findingSchema = z.object({
  id: z.string().trim().min(1).max(100),
  lens: z.enum(AI_REVIEW_FINDING_LENSES),
  severity: z.enum(AI_REVIEW_FINDING_SEVERITIES),
  section: z.enum(AI_REVIEW_SECTIONS),
  targetType: z.enum(AI_REVIEW_TARGET_TYPES),
  targetId: z.union([z.string().trim().min(1), z.null()]).optional().default(null),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(2000),
  suggestedAdminQuestion: z.string().trim().min(1).max(1000),
  suggestedRevisionText: z.union([z.string().trim().max(2000), z.null()]).optional().default(null),
  evidenceNeeded: z.array(z.string().trim().min(1).max(200)).optional().default([]),
  blockingLevel: z.enum(AI_REVIEW_BLOCKING_LEVELS),
  confidence: confidenceSchema,
}).strip();

const checklistSuggestionSchema = z.object({
  key: z.enum(PROJECT_REVIEW_CHECKLIST_KEYS),
  labelKey: z.enum(PROJECT_REVIEW_CHECKLIST_KEYS),
  suggestedState: z.enum(AI_REVIEW_CHECKLIST_STATES),
  reason: z.string().trim().min(1).max(1000),
  sourceFindingIds: z.array(z.string().trim().min(1).max(100)).optional().default([]),
}).strip();

export const normalizedAIReviewOutputSchema = z.object({
  overallRiskLevel: z.enum(AI_REVIEW_RISK_LEVELS),
  overallRiskScore: z.number().min(0).max(100),
  confidence: confidenceSchema,
  summary: z.string().trim().min(1).max(4000),
  disclaimer: z.literal("advisory_only"),
  findings: z.array(findingSchema).optional().default([]),
  checklistSuggestions: z.array(checklistSuggestionSchema).optional().default([]),
}).strip();

const scanForbiddenDecisionText = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return FORBIDDEN_AI_DECISION_PATTERNS.some((pattern) => pattern.test(text));
};

const getDeepValue = (obj, pathArray) => {
  if (!pathArray || !Array.isArray(pathArray)) return undefined;
  let current = obj;
  for (const key of pathArray) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
};

export function validateNormalizedAIReviewOutput(value) {
  let parsed;
  try {
    parsed = normalizedAIReviewOutputSchema.parse(value);
  } catch (error) {
    const zodError = error;
    const wrappedError = new Error("AI output failed schema validation");
    wrappedError.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID;
    wrappedError.parseStage = "SCHEMA_VALIDATION";
    wrappedError.validationIssues = Array.isArray(zodError?.issues)
      ? zodError.issues.map((issue) => {
          let received = issue.received;
          if (received === undefined && issue.path) {
            received = getDeepValue(value, issue.path);
          }
          let receivedStr;
          if (received === undefined && "received" in issue) {
            receivedStr = "undefined";
          } else if (typeof received === "object" && received !== null) {
            try {
              receivedStr = JSON.stringify(received).slice(0, 50);
            } catch (_) {
              receivedStr = "[object]";
            }
          } else if (received !== undefined) {
            receivedStr = String(received);
          }
          return {
            path: issue.path?.join?.(".") || "",
            message: issue.message || "",
            expected: issue.expected !== undefined ? String(issue.expected) : undefined,
            received: receivedStr,
          };
        })
      : [];
    throw wrappedError;
  }

  if (scanForbiddenDecisionText(parsed)) {
    const error = new Error("AI output contains final-decision wording");
    error.code = PROJECT_AI_REVIEW_ERROR_CODE.AI_OUTPUT_INVALID;
    error.parseStage = "FORBIDDEN_WORDING";
    throw error;
  }

  return parsed;
}
