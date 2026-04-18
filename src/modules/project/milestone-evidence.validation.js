import { z } from 'zod';

export const createEvidenceSchema = z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ'),
    milestoneId: z.string().uuid('Milestone ID phải là định dạng UUID'),
    reportContent: z.string().min(50, 'Báo cáo nghiệm thu phải có ít nhất 50 ký tự'),
    mediaIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Media ID không hợp lệ')).min(1, 'Phải có ít nhất 1 bằng chứng (ảnh/tài liệu)'),
    financialReport: z.object({
        spentAmount: z.coerce.number().int().min(0, 'Số tiền đã chi không được âm'),
        unspentAmount: z.coerce.number().int().min(0, 'Số tiền dư không được âm'),
        expenseItems: z.array(z.object({
            itemName: z.string().min(2, 'Tên mục chi tiêu quá ngắn').max(100),
            amount: z.coerce.number().int().min(0, 'Số tiền chi không được âm'),
            note: z.string().max(255).optional(),
            receiptMediaId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Media ID không hợp lệ').optional().nullable()
        })).optional().default([]),
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

export const patchEvidenceSchema = z.object({
    reportContent: z.string().min(50, 'Báo cáo nghiệm thu phải có ít nhất 50 ký tự').optional(),
    mediaIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Media ID không hợp lệ')).min(1, 'Phải có ít nhất 1 bằng chứng').optional(),
    financialReport: z.object({
        spentAmount: z.coerce.number().int().min(0),
        unspentAmount: z.coerce.number().int().min(0),
        expenseItems: z.array(z.object({
            itemName: z.string().min(2).max(100),
            amount: z.coerce.number().int().min(0),
            note: z.string().max(255).optional(),
            receiptMediaId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable()
        })).optional().default([]),
        note: z.string().optional()
    }).optional().nullable()
}).strict();