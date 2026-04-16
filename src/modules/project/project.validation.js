import { z } from "zod";
import {
  PROJECT_CATEGORY,
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
      .regex(
        cloudinaryUrlRegex,
        "Chỉ chấp nhận URL hình ảnh/tài liệu từ CDN của hệ thống",
      )
      .optional(),
    publicId: z.string().min(1, "publicId không được rỗng").optional(),
    originalName: z.string().optional(),
    mimetype: z.string().optional(),
    size: z.number().nonnegative().optional(),
    mediaType: z.string().optional(),
  })
  .strict()
  .refine((data) => data._id || (data.url && data.publicId), {
    message: "Media bắt buộc phải có _id hoặc cặp (url + publicId)",
    path: ["media"],
  });

const locationSchema = z.object({
  type: z.literal("Point").default("Point"),
  coordinates: z
    .array(z.number())
    .length(2, "Tọa độ phải gồm chính xác kinh độ và vĩ độ")
    .refine(
      (coords) => coords[0] >= -180 && coords[0] <= 180,
      "Kinh độ (Longitude) phải nằm trong khoảng [-180, 180]",
    )
    .refine(
      (coords) => coords[1] >= -90 && coords[1] <= 90,
      "Vĩ độ (Latitude) phải nằm trong khoảng [-90, 90]",
    ),
  address: z.string().min(1, "Địa chỉ không được để trống"),
});

const beneficiaryInfoSchema = z.object({
  details: z.string().max(1000, "Chi tiết người thụ hưởng quá dài").optional(),
  totalBeneficiaries: z.coerce
    .number()
    .min(0, "Số người thụ hưởng không được âm")
    .optional(),
  evidenceMethod: z
    .string()
    .max(500, "Phương pháp chứng minh quá dài")
    .optional(),
});

const budgetItemSchema = z.object({
  item: z.string().min(1, "Tên hạng mục không được để trống").max(200),
  amount: z.coerce.number().min(0, "Số tiền không được âm"),
  note: z.string().max(500).optional(),
});

const milestoneSchema = z.object({
  title: z.string().max(100, "Tiêu đề mốc tối đa 100 ký tự"),
  description: z.string().max(500, "Mô tả mốc tối đa 500 ký tự"),
  targetAmount: z.coerce
    .number()
    .min(0, "Số tiền không được âm")
    .optional()
    .default(0),
  startDate: dateInputSchema.optional(),
  deliverables: z.string().max(1000, "Kết quả nghiệm thu quá dài").optional(),
  endDate: dateInputSchema.optional(),
});

const volunteerRoleSchema = z.object({
  title: z.string().max(100, "Tiêu đề vai trò tối đa 100 ký tự"),
  quantity: z.coerce.number().min(1, "Số lượng phải lớn hơn 0"),
  skillsRequired: z.array(z.string()).optional(),
  location: z.string().max(500, "Địa điểm quá dài").optional(),
  duration: z.string().max(500, "Thời gian dự kiến quá dài").optional(),
});

const projectBaseShape = {
  projectType: z.enum(Object.values(PROJECT_TYPE)),
  title: z.string().max(100, "Tiêu đề dự án tối đa 100 ký tự"),
  category: z.enum(Object.values(PROJECT_CATEGORY)),
  location: locationSchema,
  description: z.string().optional().default(""),
  beneficiaryInfo: beneficiaryInfoSchema.optional(),

  targetAmount: z.coerce
    .number()
    .min(0, "Mục tiêu ngân sách không được âm")
    .optional()
    .default(0),
  mvpAmount: z.coerce
    .number()
    .min(0, "Ngưỡng MVP không được âm")
    .optional()
    .default(0),
  budgetBreakdown: z
    .array(budgetItemSchema)
    .max(50, "Tối đa 50 hạng mục ngân sách")
    .optional(),
  surplusPolicy: z.enum(Object.values(SURPLUS_POLICY)).optional(),
  carryOverProjectId: objectIdSchema.nullable().optional(),

  startDate: dateInputSchema.nullable().optional(),
  endDate: dateInputSchema.nullable().optional(),

  milestones: z.array(milestoneSchema).max(20, "Tối đa 20 mốc").optional(),
  needsVolunteers: z.boolean().optional().default(false),
  volunteerRoles: z
    .array(volunteerRoleSchema)
    .max(20, "Tối đa 20 vai trò")
    .optional(),

  fromHelpRequestId: objectIdSchema.nullable().optional(),

  coverMedia: z.union([z.array(mediaPayloadSchema), mediaPayloadSchema]).optional(),
  documents: z.array(mediaPayloadSchema).optional(),
};

const addIssue = (ctx, path, message) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
};

const validateDateRange = (startDate, endDate, ctx, path) => {
  if (!startDate || !endDate) return;

  if (new Date(endDate) <= new Date(startDate)) {
    addIssue(ctx, path, "Ngày kết thúc phải diễn ra sau ngày bắt đầu");
  }
};

const validateMilestonesDateRange = (milestones = [], ctx) => {
  milestones.forEach((milestone, index) => {
    if (!milestone?.startDate || !milestone?.endDate) return;

    if (new Date(milestone.endDate) <= new Date(milestone.startDate)) {
      addIssue(
        ctx,
        ["milestones", index, "endDate"],
        "Hạn chót mốc phải diễn ra sau ngày bắt đầu mốc",
      );
    }
  });
};

const validateSurplusPolicy = (data, ctx) => {
  if (
    data.surplusPolicy === SURPLUS_POLICY.CARRY_OVER &&
    !data.carryOverProjectId
  ) {
    addIssue(
      ctx,
      ["carryOverProjectId"],
      "Phải chọn dự án đích khi sử dụng chính sách CARRY_OVER",
    );
  }
};

const validateFundedRules = (data, ctx) => {
  if (Number(data.mvpAmount || 0) > Number(data.targetAmount || 0)) {
    addIssue(
      ctx,
      ["mvpAmount"],
      "Số tiền MVP không được lớn hơn tổng mục tiêu",
    );
  }
};

const validateVolunteerOnlyRules = (data, ctx) => {
  if (Number(data.targetAmount || 0) > 0) {
    addIssue(
      ctx,
      ["targetAmount"],
      "Dự án VOLUNTEER_ONLY không được phép nhập Target Amount",
    );
  }

  if (data.budgetBreakdown?.length) {
    addIssue(
      ctx,
      ["budgetBreakdown"],
      "Dự án VOLUNTEER_ONLY không được khai báo Budget Breakdown",
    );
  }

  if (
    data.milestones?.some(
      (milestone) => Number(milestone?.targetAmount || 0) > 0,
    )
  ) {
    addIssue(
      ctx,
      ["milestones"],
      "Các mốc của dự án VOLUNTEER_ONLY không được phép có ngân sách",
    );
  }
};

const applyLifecycleRefinement = (data, ctx) => {
  validateDateRange(data.startDate, data.endDate, ctx, ["endDate"]);
  validateMilestonesDateRange(data.milestones, ctx);
  validateSurplusPolicy(data, ctx);

  if (data.projectType === PROJECT_TYPE.FUNDED) {
    validateFundedRules(data, ctx);
    return;
  }

  if (data.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
    validateVolunteerOnlyRules(data, ctx);
  }
};

const countEvidenceFiles = (coverMedia, documents) => {
  const docCount = Array.isArray(documents) ? documents.length : 0;

  if (Array.isArray(coverMedia)) {
    return docCount + coverMedia.length;
  }

  return docCount + (coverMedia ? 1 : 0);
};

export const createDraftSchema = z
  .object(projectBaseShape)
  .strict()
  .superRefine(applyLifecycleRefinement);

export const updateDraftSchema = z
  .object({
    ...projectBaseShape,
    projectType: z.enum(Object.values(PROJECT_TYPE)).optional(),
    title: z.string().max(100).optional(),
    category: z.enum(Object.values(PROJECT_CATEGORY)).optional(),
    location: locationSchema.optional(),
    deletedDocumentIds: z.union([z.array(objectIdSchema), objectIdSchema]).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    validateDateRange(data.startDate, data.endDate, ctx, ["endDate"]);
    validateMilestonesDateRange(data.milestones, ctx);
    validateSurplusPolicy(data, ctx);

    if (!data.projectType) return;

    if (data.projectType === PROJECT_TYPE.FUNDED) {
      validateFundedRules(data, ctx);
      return;
    }

    if (data.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
      validateVolunteerOnlyRules(data, ctx);
    }
  });

export const submitApprovalSchema = z.object({}).strict();

export const projectCompleteSchema = z
  .object({
    projectType: z.enum(Object.values(PROJECT_TYPE)),
    description: z.string().min(
      200,
      "Mô tả dự án phải dài tối thiểu 200 ký tự (Block 1)",
    ),
    beneficiaryInfo: z.object({
      details: z.string().min(1, "Thiếu chi tiết người thụ hưởng (Block 1)"),
    }),
    coverMedia: z.any().optional(),
    documents: z.array(z.any()).optional(),
    targetAmount: z.number().optional(),
    mvpAmount: z.number().optional(),
    budgetBreakdown: z.array(z.any()).optional(),
    surplusPolicy: z.string().optional(),
    milestones: z
      .array(z.any())
      .min(1, "Dự án bắt buộc phải có ít nhất 1 Mốc hoạt động (Block 4)"),
    needsVolunteers: z.boolean().optional(),
    volunteerRoles: z.array(z.any()).optional(),
  })
  .superRefine((data, ctx) => {
    const evidenceCount = countEvidenceFiles(data.coverMedia, data.documents);

    if (evidenceCount < 3) {
      addIssue(
        ctx,
        ["documents"],
        "Bắt buộc phải có tối thiểu 3 hình ảnh/tài liệu chứng minh (Block 2)",
      );
    }

    if (data.projectType === PROJECT_TYPE.FUNDED) {
      if (!data.targetAmount || data.targetAmount <= 0) {
        addIssue(
          ctx,
          ["targetAmount"],
          "Dự án FUNDED bắt buộc phải có Mục tiêu ngân sách (Block 3)",
        );
      }

      if (!data.mvpAmount || data.mvpAmount <= 0) {
        addIssue(
          ctx,
          ["mvpAmount"],
          "Dự án FUNDED bắt buộc phải có Ngưỡng tối thiểu MVP (Block 3)",
        );
      }

      if (!data.budgetBreakdown || data.budgetBreakdown.length === 0) {
        addIssue(
          ctx,
          ["budgetBreakdown"],
          "Dự án FUNDED bắt buộc phải có Giải trình ngân sách (Block 3)",
        );
      }

      if (!data.surplusPolicy) {
        addIssue(
          ctx,
          ["surplusPolicy"],
          "Dự án FUNDED bắt buộc chọn Chính sách xử lý tiền thừa (Block 3)",
        );
      }

      const sumMilestones = data.milestones.reduce(
        (sum, milestone) => sum + Number(milestone?.targetAmount || 0),
        0,
      );

      if (sumMilestones !== data.targetAmount) {
        addIssue(
          ctx,
          ["milestones"],
          `Tổng ngân sách các mốc (${sumMilestones}) không khớp với Mục tiêu ngân sách dự án (${data.targetAmount}).`,
        );
      }
    }

    data.milestones.forEach((milestone, index) => {
      if (!milestone?.deliverables) {
        addIssue(
          ctx,
          ["milestones", index, "deliverables"],
          `Mốc "${milestone?.title || index + 1}" thiếu Kết quả nghiệm thu thực tế (Deliverables).`,
        );
      }

      if (data.projectType === PROJECT_TYPE.FUNDED && !milestone?.endDate) {
        addIssue(
          ctx,
          ["milestones", index, "endDate"],
          `Mốc "${milestone?.title || index + 1}" của dự án FUNDED bắt buộc phải có Deadline (endDate).`,
        );
      }
    });

    if (
      data.needsVolunteers &&
      (!data.volunteerRoles || data.volunteerRoles.length === 0)
    ) {
      addIssue(
        ctx,
        ["volunteerRoles"],
        "Dự án cần Tình nguyện viên nhưng chưa cấu hình Vai trò (Block 5).",
      );
    }
  });