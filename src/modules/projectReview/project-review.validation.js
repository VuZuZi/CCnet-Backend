import { z } from "zod";
import {
  PROJECT_REVIEW_CHECKLIST_KEYS,
  PROJECT_REVIEW_DECISION,
} from "./project-review.constant.js";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

const checklistSchema = z
  .object(
    PROJECT_REVIEW_CHECKLIST_KEYS.reduce((shape, key) => {
      shape[key] = z.boolean().optional().default(false);
      return shape;
    }, {})
  )
  .strict();

export const projectDecisionSchema = z.object({
  decision: z.enum(Object.values(PROJECT_REVIEW_DECISION)),
  expectedStatus: z.string().trim().min(1),
  expectedSubmissionVersion: z.coerce.number().int().min(1),
  expectedProjectSnapshotHash: z.string().trim().min(1),
  checklist: checklistSchema.optional().default({}),
  reason: z.string().trim().max(4000).optional().default(""),
  feedback: z.string().trim().max(4000).optional().default(""),
  aiReviewRunId: objectIdSchema.optional().nullable(),
  manualAiBypassAcknowledged: z.boolean().optional().default(false),
  manualAiBypassReason: z.string().trim().max(1000).optional().default(""),
}).strict();
