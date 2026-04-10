import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không đúng định dạng ObjectId');

export const applyVolunteerSchema = z.object({
    opportunityId: objectIdSchema,
    skills: z.string().min(5, 'Vui lòng nhập chi tiết kỹ năng').max(1000, 'Kỹ năng quá dài'),
    motivation: z.string().min(10, 'Lý do ứng tuyển quá ngắn').max(1500, 'Lý do ứng tuyển quá dài'),
    availability: z.string().min(5, 'Vui lòng nhập rõ thời gian rảnh').max(500, 'Nội dung quá dài')
}).strict();

export const updateApplicationSchema = z.object({
    skills: z.string().min(5).max(1000).optional(),
    motivation: z.string().min(10).max(1500).optional(),
    availability: z.string().min(5).max(500).optional()
}).strict();

export const rejectApplicationSchema = z.object({
    rejectReason: z.string().min(5, 'Bắt buộc nhập lý do từ chối (tối thiểu 5 ký tự)').max(500, 'Lý do từ chối quá dài')
}).strict();

export const idParamSchema = z.object({
    id: objectIdSchema
}).strict();

export const projectParamsSchema = z.object({
    projectId: objectIdSchema,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL']).optional()
}).strict();

export const paginationQuerySchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(20).optional(),
    cursor: objectIdSchema.optional()
}).strict();