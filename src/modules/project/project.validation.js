import { z } from "zod";
import {
  PROJECT_CATEGORY,
  PROJECT_STATUS,
  PROJECT_TYPE,
  SURPLUS_POLICY,
} from "./project.constant.js";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "ID không đúng định dạng ObjectId");

const cloudinaryUrlRegex = /^https:\/\/res\.cloudinary\.com\/.*$/;

const dateInputSchema = z.union([
  z.string().datetime({ offset: true }),
  z.date(),
]);

const mediaPayloadSchema = z
  .object({
    _id: objectIdSchema.optional(),
    url: z
      .string()
      .url("URL không hợp lệ")
      .regex(cloudinaryUrlRegex, "Chỉ chấp nhận URL từ CDN hệ thống")
      .optional(),
    publicId: z.string().min(1).optional(),
    originalName: z.string().optional(),
    mimetype: z.string().optional(),
    size: z.number().nonnegative().optional(),
    mediaType: z.string().optional(),
  })
  .strict()
  .refine((data) => data._id || (data.url && data.publicId), {
    message: "Media phải có _id hoặc cặp url + publicId",
  });

const locationSchema = z.object({
  type: z.literal("Point").default("Point"),
  coordinates: z.array(z.number()).length(2, "Tọa độ phải có 2 phần tử"),
  address: z.string().min(1, "Địa chỉ không được để trống"),
});

const beneficiaryInfoSchema = z.object({
  details: z.string().max(1000).optional(),
  totalBeneficiaries: z.coerce.number().min(0).optional(),
  evidenceMethod: z.string().max(500).optional(),
});

const budgetItemSchema = z.object({
  item: z.string().min(1),
  amount: z.coerce.number().min(0),
  note: z.string().optional(),
});

const evidencePolicySchema = z.object({
  requireFinancial: z.boolean().optional(),
  requireGeoPhotos: z.coerce.number().min(0).optional(),
  requireVolunteerLogs: z.boolean().optional()
});

const milestoneSchema = z.object({
  title: z.string().max(100, "Tiêu đề mốc tối đa 100 ký tự"),
  description: z.string().max(500, "Mô tả mốc tối đa 500 ký tự"),
  targetAmount: z.coerce.number().min(0, "Số tiền không được âm").optional().default(0),
  deliverables: z.string().max(1000, "Kết quả nghiệm thu quá dài").optional(),
  startDate: z.union([z.string().datetime({ offset: true }), z.date()]).nullable().optional(),
  endDate: z.union([z.string().datetime({ offset: true }), z.date()]).nullable().optional(),
  location: locationSchema.optional(),
  evidencePolicy: evidencePolicySchema.optional()
});

const volunteerRoleSchema = z.object({
  title: z.string(),
  quantity: z.coerce.number().min(1),
  skillsRequired: z.array(z.string()).optional(),
});

const projectBaseShape = {
  projectType: z.enum(Object.values(PROJECT_TYPE)),
  title: z.string().max(100),
  category: z.enum(Object.values(PROJECT_CATEGORY)),
  location: locationSchema,
  description: z.string().optional().default(""),
  beneficiaryInfo: beneficiaryInfoSchema.optional(),

  targetAmount: z.coerce.number().min(0).optional().default(0),
  mvpAmount: z.coerce.number().min(0).optional().default(0),
  budgetBreakdown: z.array(budgetItemSchema).optional(),

  surplusPolicy: z.enum(Object.values(SURPLUS_POLICY)).optional(),
  carryOverProjectId: objectIdSchema.nullable().optional(),

  startDate: dateInputSchema.nullable().optional(),
  endDate: dateInputSchema.nullable().optional(),

  milestones: z.array(milestoneSchema).optional(),
  needsVolunteers: z.boolean().optional().default(false),
  volunteerRoles: z.array(volunteerRoleSchema).optional(),

  coverMedia: z
    .union([z.array(mediaPayloadSchema), mediaPayloadSchema])
    .optional(),
  documents: z.array(mediaPayloadSchema).optional(),
};

const addIssue = (ctx, path, message) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
};

const validateDateRange = (start, end, ctx) => {
  if (start && end && new Date(end) <= new Date(start)) {
    addIssue(ctx, ["endDate"], "Ngày kết thúc phải sau ngày bắt đầu");
  }
};

const validateFunded = (data, ctx) => {
  if (!data.targetAmount) {
    addIssue(ctx, ["targetAmount"], "Thiếu target");
  }
  if (!data.mvpAmount) {
    addIssue(ctx, ["mvpAmount"], "Thiếu mvp");
  }
};

const validateVolunteer = (data, ctx) => {
  if (Number(data.targetAmount || 0) > 0) {
    addIssue(ctx, ["targetAmount"], "Volunteer không có tiền");
  }
};

const refine = (data, ctx) => {
  validateDateRange(data.startDate, data.endDate, ctx);

  if (data.projectType === PROJECT_TYPE.FUNDED) {
    validateFunded(data, ctx);
  }

  if (data.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
    validateVolunteer(data, ctx);
  }
};

export const createDraftSchema = z
  .object(projectBaseShape)
  .strict()
  .superRefine(refine);

export const updateDraftSchema = z
  .object({
    ...projectBaseShape,
    projectType: z.enum(Object.values(PROJECT_TYPE)).optional(),
  })
  .strict()
  .superRefine(refine);

export const projectCompleteSchema = z
  .object({
    projectType: z.enum(Object.values(PROJECT_TYPE)),
    description: z.string().min(200),
    milestones: z.array(z.any()).min(1),
    targetAmount: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.projectType === PROJECT_TYPE.FUNDED) {
      if (!data.targetAmount) {
        addIssue(ctx, ["targetAmount"], "Thiếu target");
      }
    }
  });

export const exploreQuerySchema = z
  .object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(9),
    category: z.enum(Object.values(PROJECT_CATEGORY)).optional(),
    sort: z.enum(["newest", "trending", "ending_soon"]).default("newest"),
    location: z.string().optional(),
    organizerScope: z.enum(["ALL", "FOLLOWED"]).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    keyword: z.string().optional(),
  })
  .passthrough();

export const workspaceQuerySchema = z
  .object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(10),
    status: z.enum([...Object.values(PROJECT_STATUS), "ALL"]).default("ALL"),
    sort: z.enum(["newest", "oldest"]).optional(),
    search: z.string().optional(),
    keyword: z.string().optional(),
    category: z.string().optional(),
  })
  .passthrough();