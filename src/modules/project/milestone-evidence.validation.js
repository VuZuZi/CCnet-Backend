import { z } from 'zod';

export const createEvidenceSchema = z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ'),
    milestoneId: z.string().uuid('Milestone ID phải là định dạng UUID'),
    reportContent: z.string().min(50, 'Báo cáo nghiệm thu phải có ít nhất 50 ký tự'),
    mediaIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Media ID không hợp lệ')).min(1, 'Phải có ít nhất 1 bằng chứng (ảnh/tài liệu)'),
    financialReport: z.object({
        spentAmount: z.number().min(0, 'Số tiền đã chi không được âm'),
        unspentAmount: z.number().min(0, 'Số tiền dư không được âm'),
        note: z.string().optional()
    }).optional().nullable()
}).strict();

export const reviewEvidenceSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
    reviewNotes: z.string().min(10, 'Phải nhập lý do chi tiết khi review').optional()
}).strict();

export const evidenceParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Evidence ID không hợp lệ')
}).strict();

export const getPublicEvidenceSchema = z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ'),
    milestoneId: z.string().uuid('Milestone ID phải là định dạng UUID')
}).strict();

export const listEvidenceQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ').optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED']).optional()
}).strict();