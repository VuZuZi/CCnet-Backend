import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Media ID không hợp lệ');

const expenseItemSchema = z.object({
    itemName: z.string().min(1, 'Tên khoản chi không được để trống').max(200, 'Tên khoản chi quá dài').optional(),
    amount: z.number().min(0, 'Số tiền khoản chi không được nhỏ hơn 0').optional(),
    note: z.string().max(500, 'Ghi chú khoản chi quá dài').optional(),
    receiptMediaId: objectIdSchema.optional()
}).strict();

const submissionModeSchema = z.enum(['GPS_CHECKIN', 'MANUAL_UPLOAD']).default('MANUAL_UPLOAD');

export const createEvidenceSchema = z.object({
    submissionMode: submissionModeSchema.optional(),
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ'),
    milestoneId: z.string().uuid('Milestone ID phải là định dạng UUID'),
    reportContent: z.string().min(10, 'Vui lòng mô tả ngắn gọn tiến độ công việc'),
    
    mediaIds: z.array(objectIdSchema).optional().default([]),
    receiptMediaIds: z.array(objectIdSchema).optional().default([]),
    expenseItems: z.array(expenseItemSchema).optional().default([]),
    
    spentAmount: z.number().min(0, 'Số tiền đã chi không được nhỏ hơn 0').optional()
}).strict();

export const reviewEvidenceSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
    reviewNotes: z.string().min(10, 'Phải nhập lý do chi tiết khi review').optional(),
    
    approvedSpentAmount: z.number().min(0, 'Số tiền thực tế được duyệt không được nhỏ hơn 0').optional()
}).strict().superRefine((data, ctx) => {
    if (data.status !== 'APPROVED' && !data.reviewNotes) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reviewNotes'],
            message: 'Bắt buộc nhập ghi chú khi REJECTED hoặc REVISION_REQUESTED'
        });
    }
});

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
    submissionMode: submissionModeSchema.optional(),
    reportContent: z.string().min(50, 'Báo cáo nghiệm thu phải có ít nhất 50 ký tự').optional(),
    
    mediaIds: z.array(objectIdSchema).optional(),
    receiptMediaIds: z.array(objectIdSchema).optional(),
    expenseItems: z.array(expenseItemSchema).optional(),
    
    spentAmount: z.number().min(0, 'Số tiền đã chi không được nhỏ hơn 0').optional()
}).strict();

export const adminListEvidenceQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ').optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED']).optional()
}).strict();
