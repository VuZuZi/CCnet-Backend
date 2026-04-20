import { z } from "zod";
import mongoose from "mongoose";

const objectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ID format",
  });

const jsonStringHelper = (schema) =>
  z.string().transform((val, ctx) => {
    try {
      return schema.parse(JSON.parse(val));
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid JSON string format",
      });
      return z.NEVER;
    }
  });

const commonFields = {
  content: z.string().max(5000, "Content exceeds 5000 characters"),
  privacy: z.enum(["public", "friends", "private"]),
};

const sharedEntitySchema = z.object({
  entityId: objectId,
  entityModel: z.enum(["Project", "NeedHelp"]),
  title: z.string(),
  thumbnail: z.string().optional(),
  description: z.string().optional(),
  ownerName: z.string().optional(),
  location: z.string().optional(),
  endDateText: z.string().optional(),
  fundingPercent: z.number().optional(),
  isFunded: z.boolean().optional(),
  isUrgent: z.boolean().optional()
});

export const PostValidation = {
  createPost: z
    .object({
      body: z.object({
        content: commonFields.content.optional(),
        privacy: commonFields.privacy.default("public"),
        type: z
          .enum(["normal", "share_project", "need_help"])
          .default("normal"),
        sharedEntity: z
          .union([sharedEntitySchema, jsonStringHelper(sharedEntitySchema)])
          .optional(),
      }),
      files: z.any().optional(),
      file: z.any().optional(),
    })

    .refine(
      (req) => {
        const hasContent = !!req.body?.content?.trim();
        const hasSharedEntity = !!req.body?.sharedEntity;
        const hasFiles = Array.isArray(req.files)
          ? req.files.length > 0
          : !!req.files || !!req.file;

        return hasContent || hasSharedEntity || hasFiles;
      },
      {
        message: "Post must have content, a shared item, or an image/video",
        path: ["body", "content"],
      },
    ),

  updatePost: z.object({
    params: z.object({ id: objectId }),
    body: z.object({
      content: commonFields.content.optional(),
      privacy: commonFields.privacy.optional(),
      removeFiles: z
        .union([z.string(), z.array(z.string())])
        .transform((val) => (Array.isArray(val) ? val : [val]))
        .optional()
        .default([]),
    }),
  }),

  toggleReaction: z.object({
    params: z.object({ id: objectId }),
    body: z.object({
      type: z.enum(["like", "dislike"]),
    }),
  }),

  addComment: z.object({
    params: z.object({ id: objectId }),
    body: z.object({
      content: z
        .string()
        .min(1, "Comment cannot be empty")
        .max(2000, "Comment too long"),
    }),
  }),

  pagination: z.object({
    query: z.object({
      limit: z.coerce.number().positive().optional(),
      page: z.coerce.number().positive().optional(),
      cursor: objectId.optional(),
      type: z.enum(["for-you", "following"]).optional(),
    }),
  }),

  paramsId: z.object({
    params: z.object({ id: objectId }),
  }),

  reportPost: z.object({
    params: z.object({ id: objectId }),
    body: z.object({
      reason_code: z.string().min(1, "Reason is required"),
      description: z.string().optional(),
      report_ref: z.string(),
      target_type: z.string(),
    }),
  }),
};
