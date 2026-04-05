import { z } from 'zod';
import { PROJECT_CATEGORY } from './project.constant.js';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID không đúng định dạng ObjectId");

const mediaPayloadSchema = z.object({
  _id: objectIdSchema.optional(),
  url: z.string().url("URL không hợp lệ").optional(),
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

const milestoneSchema = z.object({
  title: z.string().max(100, "Tiêu đề mốc tối đa 100 ký tự"),
  description: z.string().max(500, "Mô tả mốc tối đa 500 ký tự"),
  targetAmount: z.coerce.number().min(0, "Số tiền không được âm")
});

const volunteerRoleSchema = z.object({
  title: z.string().max(100, "Tiêu đề vai trò tối đa 100 ký tự"),
  quantity: z.coerce.number().min(1, "Số lượng phải lớn hơn 0"),
  skillsRequired: z.array(z.string()).optional()
});

export const createDraftSchema = z.object({
  title: z.string().max(200, "Tiêu đề dự án tối đa 200 ký tự"),
  category: z.enum(Object.values(PROJECT_CATEGORY)),
  location: locationSchema,
  description: z.string().optional().default(''),

  targetAmount: z.coerce.number().min(0, "Mục tiêu ngân sách không được âm").optional(),
  startDate: z.string().datetime({ offset: true }).or(z.date()).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.date()).optional(),

  milestones: z.array(milestoneSchema).max(20, "Tối đa 20 mốc").optional(),
  needsVolunteers: z.boolean().optional().default(false),
  volunteerRoles: z.array(volunteerRoleSchema).max(20, "Tối đa 20 vai trò").optional(),

  isFundraising: z.boolean().optional(),
  fromHelpRequestId: objectIdSchema.optional(),

  coverMedia: z.union([z.array(mediaPayloadSchema), mediaPayloadSchema]).optional(),
  documents: z.array(mediaPayloadSchema).optional(),
}).strict().refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  { message: "Ngày kết thúc phải sau ngày bắt đầu", path: ["endDate"] }
);

export const updateDraftSchema = z.object({
  title: z.string().max(200).optional(),
  category: z.enum(Object.values(PROJECT_CATEGORY)).optional(),
  location: locationSchema.optional(),
  description: z.string().optional(),

  targetAmount: z.coerce.number().min(0, "Mục tiêu ngân sách không được âm").optional(),
  startDate: z.string().datetime({ offset: true }).or(z.date()).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.date()).optional(),

  milestones: z.array(milestoneSchema).max(20, "Tối đa 20 mốc").optional(),
  needsVolunteers: z.boolean().optional(),
  volunteerRoles: z.array(volunteerRoleSchema).max(20, "Tối đa 20 vai trò").optional(),

  isFundraising: z.boolean().optional(),
  fromHelpRequestId: objectIdSchema.optional(),

  deletedDocumentIds: z.union([
    z.array(objectIdSchema),
    objectIdSchema
  ]).optional(),

  coverMedia: z.union([z.array(mediaPayloadSchema), mediaPayloadSchema]).optional(),
  documents: z.array(mediaPayloadSchema).optional(),

}).strict();

export const submitApprovalSchema = z.object({}).strict();