import { z } from 'zod';
import {
  PROJECT_CATEGORY,
  PROJECT_STATUS,
  PROJECT_TYPE,
  SURPLUS_POLICY
} from './project.constant.js';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID không đúng định dạng ObjectId");

const cloudinaryUrlRegex = /^https:\/\/res\.cloudinary\.com\/.*$/;

const dateInputSchema = z.union([z.string().datetime({ offset: true }), z.date()]);

const addIssue = (ctx, path, message) => {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
};

const mediaPayloadSchema = z.object({
  _id: objectIdSchema.optional(),
  url: z.string().url("URL không hợp lệ").regex(cloudinaryUrlRegex, "Chỉ chấp nhận URL hình ảnh/tài liệu từ CDN của hệ thống").optional(),
  publicId: z.string().min(1, "publicId không được rỗng").optional(),
  originalName: z.string().optional(),
  mimetype: z.string().optional(),
  size: z.number().nonnegative().optional(),
  mediaType: z.string().optional()
}).strict().refine(data => data._id || (data.url && data.publicId), {
  message: "Media bắt buộc phải có _id (đã lưu) hoặc cặp (url + publicId) (mới upload)",
  path: ["media"]
});

const locationSchema = z.object({
  type: z.literal('Point').default('Point'),
  coordinates: z.array(z.number())
    .length(2, "Tọa độ phải gồm chính xác kinh độ và vĩ độ")
    .refine(coords => coords[0] >= -180 && coords[0] <= 180, "Kinh độ (Longitude) phải nằm trong khoảng [-180, 180]")
    .refine(coords => coords[1] >= -90 && coords[1] <= 90, "Vĩ độ (Latitude) phải nằm trong khoảng [-90, 90]"),
  address: z.string().min(1, "Địa chỉ không được để trống")
});

const beneficiaryInfoSchema = z.object({
  details: z.string().max(1000, "Chi tiết người thụ hưởng quá dài").optional(),
  totalBeneficiaries: z.coerce.number().min(0, "Số người thụ hưởng không được âm").optional(),
  evidenceMethod: z.string().max(500, "Phương pháp chứng minh quá dài").optional()
});

const budgetItemSchema = z.object({
  item: z.string().min(1, "Tên hạng mục không được để trống").max(200),
  amount: z.coerce.number().min(0, "Số tiền không được âm"),
  note: z.string().max(500).optional()
});

const evidencePolicySchema = z.object({
  requireFinancial: z.boolean().optional(),
  requireGeoPhotos: z.coerce.number().min(0).optional(),
  requireVolunteerLogs: z.boolean().optional()
});

const milestoneSchema = z.object({
  milestoneId: z.string().uuid().optional(),
  title: z.string().max(100, "Tiêu đề mốc tối đa 100 ký tự"),
  description: z.string().max(500, "Mô tả mốc tối đa 500 ký tự"),
  targetAmount: z.coerce.number().min(0, "Số tiền không được âm").optional().default(0),
  deliverables: z.string().max(1000, "Kết quả nghiệm thu quá dài").optional(),
  startDate: dateInputSchema.nullable().optional(),
  endDate: dateInputSchema.nullable().optional(),
  location: locationSchema.optional(),
  evidencePolicy: evidencePolicySchema.optional()
});

const volunteerRoleSchema = z.object({
  title: z.string().max(100, "Tiêu đề vai trò tối đa 100 ký tự"),
  quantity: z.coerce.number().min(1, "Số lượng phải lớn hơn 0"),
  skillsRequired: z.array(z.string()).optional(),
  location: z.string().max(500, "Địa điểm quá dài").optional(),
  duration: z.string().max(500, "Thời gian dự kiến quá dài").optional()
});

const projectBaseSchema = {
  projectType: z.enum(Object.values(PROJECT_TYPE)),
  title: z.string().max(100, "Tiêu đề dự án tối đa 100 ký tự"),
  category: z.enum(Object.values(PROJECT_CATEGORY)),
  location: locationSchema,
  description: z.string().optional().default(''),
  beneficiaryInfo: beneficiaryInfoSchema.optional(),

  targetAmount: z.coerce.number().min(0, "Mục tiêu ngân sách không được âm").optional().default(0),
  mvpAmount: z.coerce.number().min(0, "Ngưỡng MVP không được âm").optional().default(0),
  budgetBreakdown: z.array(budgetItemSchema).max(50, "Tối đa 50 hạng mục ngân sách").optional(),

  surplusPolicy: z.enum(Object.values(SURPLUS_POLICY)).optional(),
  carryOverProjectId: objectIdSchema.nullable().optional(),

  startDate: dateInputSchema.nullable().optional(),
  endDate: dateInputSchema.nullable().optional(),

  milestones: z.array(milestoneSchema).max(20, "Tối đa 20 mốc").optional(),
  needsVolunteers: z.boolean().optional().default(false),
  volunteerRoles: z.array(volunteerRoleSchema).max(20, "Tối đa 20 vai trò").optional(),

  fromHelpRequestId: objectIdSchema.nullable().optional(),

  coverMedia: z.union([z.array(mediaPayloadSchema), mediaPayloadSchema]).optional(),
  documents: z.array(mediaPayloadSchema).optional(),
};

const lifecycleRefinement = (data, ctx) => {
  if (data.projectType === PROJECT_TYPE.FUNDED) {
    if (data.mvpAmount > data.targetAmount) {
      addIssue(ctx, ["mvpAmount"], "Số tiền MVP (ngưỡng tối thiểu) không được lớn hơn Tổng mục tiêu (Target Amount)");
    }
  } else if (data.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
    if (data.targetAmount > 0) {
      addIssue(ctx, ["targetAmount"], "Dự án VOLUNTEER_ONLY bị bypass luồng tiền, không được phép nhập Target Amount");
    }
    if (data.budgetBreakdown && data.budgetBreakdown.length > 0) {
      addIssue(ctx, ["budgetBreakdown"], "Dự án VOLUNTEER_ONLY không được khai báo phân bổ ngân sách (Budget Breakdown)");
    }
    if (data.milestones && data.milestones.some(m => m.targetAmount > 0)) {
      addIssue(ctx, ["milestones"], "Các mốc của dự án VOLUNTEER_ONLY không được phép có ngân sách");
    }
  }

  if (data.startDate && data.endDate) {
    if (new Date(data.endDate) <= new Date(data.startDate)) {
      addIssue(ctx, ["endDate"], "Ngày kết thúc phải diễn ra sau ngày bắt đầu");
    }
  }
};

export const createDraftSchema = z.object(projectBaseSchema)
  .strict()
  .superRefine(lifecycleRefinement);

export const updateDraftSchema = z.object({
  ...projectBaseSchema,
  projectType: z.enum(Object.values(PROJECT_TYPE)).optional(),
  title: z.string().max(100).optional(),
  category: z.enum(Object.values(PROJECT_CATEGORY)).optional(),
  location: locationSchema.optional(),
  deletedDocumentIds: z.union([z.array(objectIdSchema), objectIdSchema]).optional(),
})
  .strict()
  .superRefine((data, ctx) => {
    if (data.projectType) {
      lifecycleRefinement(data, ctx);
    } else {
      if (data.startDate && data.endDate && new Date(data.endDate) <= new Date(data.startDate)) {
        addIssue(ctx, ["endDate"], "Ngày kết thúc phải diễn ra sau ngày bắt đầu");
      }
    }
  });

export const updateUpdatingProjectSchema = z.object({
  milestones: z.array(milestoneSchema).min(1, "Phải có ít nhất 1 milestone"),
}).strict();

export const submitApprovalSchema = z.object({}).strict();

export const projectCompleteSchema = z.object({
  projectType: z.enum(Object.values(PROJECT_TYPE)),
  description: z.string().min(200, "Mô tả dự án phải dài tối thiểu 200 ký tự (Block 1)"),
  beneficiaryInfo: z.object({
    details: z.string().min(1, "Thiếu chi tiết người thụ hưởng (Block 1)")
  }),
  startDate: dateInputSchema.optional(),
  endDate: dateInputSchema.optional(),
  coverMedia: z.any().optional(),
  documents: z.array(z.any()).optional(),
  targetAmount: z.number().optional(),
  mvpAmount: z.number().optional(),
  budgetBreakdown: z.array(z.any()).optional(),
  milestones: z.array(z.any()).min(1, "Dự án bắt buộc phải có ít nhất 1 Mốc hoạt động (Block 4)"),
  needsVolunteers: z.boolean().optional(),
  volunteerRoles: z.array(z.any()).optional()
}).superRefine((data, ctx) => {
  const docCount = data.documents?.length || 0;
  const coverCount = data.coverMedia?.url || data.coverMedia ? 1 : 0;
  if (docCount + coverCount < 3) {
    addIssue(ctx, ["documents"], "Bắt buộc phải có tối thiểu 3 hình ảnh/tài liệu chứng minh (Block 2)");
  }

  if (data.projectType === PROJECT_TYPE.FUNDED) {
    if (!data.targetAmount || data.targetAmount <= 0) {
      addIssue(ctx, ["targetAmount"], "Dự án FUNDED bắt buộc phải có Mục tiêu ngân sách (Block 3)");
    }
    if (!data.mvpAmount || data.mvpAmount <= 0) {
      addIssue(ctx, ["mvpAmount"], "Dự án FUNDED bắt buộc phải có Ngưỡng tối thiểu MVP (Block 3)");
    }
    if (!data.budgetBreakdown || data.budgetBreakdown.length === 0) {
      addIssue(ctx, ["budgetBreakdown"], "Dự án FUNDED bắt buộc phải có Giải trình ngân sách (Block 3)");
    }

    const sumMilestones = data.milestones.reduce((acc, curr) => acc + (curr.targetAmount || 0), 0);
    if (sumMilestones !== data.targetAmount) {
      addIssue(ctx, ["milestones"], `Tổng ngân sách các mốc (${sumMilestones}) không khớp với Mục tiêu ngân sách dự án (${data.targetAmount}).`);
    }
  }

  const projStart = data.startDate ? new Date(data.startDate).getTime() : null;
  const projEnd = data.endDate ? new Date(data.endDate).getTime() : null;

  data.milestones.forEach((m, index) => {
    if (!m.deliverables) {
      addIssue(ctx, [`milestones[${index}]`], `Mốc "${m.title}" thiếu Kết quả nghiệm thu thực tế (Deliverables).`);
    }

    if (data.projectType === PROJECT_TYPE.FUNDED) {
      if (!m.startDate) {
        addIssue(ctx, [`milestones[${index}]`], `Mốc "${m.title}" bắt buộc phải có Ngày bắt đầu (startDate).`);
      }
      if (!m.endDate) {
        addIssue(ctx, [`milestones[${index}]`], `Mốc "${m.title}" bắt buộc phải có Deadline (endDate).`);
      }
    }

    const mStart = m.startDate ? new Date(m.startDate).getTime() : null;
    const mEnd = m.endDate ? new Date(m.endDate).getTime() : null;

    if (mStart && mEnd && mStart >= mEnd) {
      addIssue(ctx, [`milestones[${index}]`], `Mốc "${m.title}": Ngày kết thúc phải sau ngày bắt đầu.`);
    }

    if (projStart && mStart && mStart < projStart) {
      addIssue(ctx, [`milestones[${index}]`], `Mốc "${m.title}": Không được bắt đầu trước ngày khởi công dự án.`);
    }

    if (projEnd && mEnd && mEnd > projEnd) {
      addIssue(ctx, [`milestones[${index}]`], `Mốc "${m.title}": Không được kết thúc sau ngày hoàn thành dự án.`);
    }
  });

  if (data.needsVolunteers) {
    if (!data.volunteerRoles || data.volunteerRoles.length === 0) {
      addIssue(ctx, ["volunteerRoles"], "Dự án cần Tình nguyện viên nhưng chưa cấu hình Vai trò (Block 5).");
    }
  }
});

export const exploreQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page phải lớn hơn 0").optional().default(1),
  limit: z.coerce.number().int().min(1).max(100, "Limit tối đa là 100").optional().default(9),
  category: z.enum(Object.values(PROJECT_CATEGORY)).optional(),
  location: z.string().trim().max(100).optional(),
  sort: z.enum(["newest", "trending", "ending_soon"]).optional().default("newest"),
  organizerScope: z.enum(["ALL", "FOLLOWED"]).optional().default("ALL"),
  search: z.string().optional(),
  keyword: z.string().optional(),
  status: z.string().optional()
}).strict();

export const mapQuerySchema = z.object({
  north: z.coerce.number().min(-90).max(90).optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  zoom: z.coerce.number().min(1).max(18).optional().default(6),
  category: z.enum(Object.values(PROJECT_CATEGORY)).optional(),
  organizerScope: z.enum(["ALL", "FOLLOWED"]).optional().default("ALL"),
  search: z.string().trim().max(100).optional(),
}).strict().superRefine((data, ctx) => {
  const hasAnyBound =
    data.north !== undefined ||
    data.south !== undefined ||
    data.east !== undefined ||
    data.west !== undefined;

  const hasAllBounds =
    data.north !== undefined &&
    data.south !== undefined &&
    data.east !== undefined &&
    data.west !== undefined;

  if (hasAnyBound && !hasAllBounds) {
    addIssue(ctx, ["north"], "Bắt buộc phải truyền đầy đủ north, south, east, west.");
  }

  if (hasAllBounds) {
    if (data.north <= data.south) {
      addIssue(ctx, ["north"], "north phải lớn hơn south.");
    }

    if (data.east <= data.west) {
      addIssue(ctx, ["east"], "east phải lớn hơn west.");
    }
  }
});

export const workspaceQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page phải lớn hơn 0").optional().default(1),
  limit: z.coerce.number().int().min(1).max(100, "Limit tối đa là 100").optional().default(10),
  status: z.enum([...Object.values(PROJECT_STATUS), 'ALL']).optional().default('ALL'),
  sort: z.enum(['newest', 'oldest']).optional().default('newest'),
  search: z.string().optional(),
  keyword: z.string().optional(),
  category: z.string().optional()
}).strict();
