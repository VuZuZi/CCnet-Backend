import { z } from 'zod';

export const createDisbursementSchema = z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ'),
    milestoneId: z.string().uuid('Milestone ID phải là định dạng UUID')
}).strict();

export const approveDisbursementSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED', 'HOLD']),
    note: z.string().min(5, 'Vui lòng ghi chú lý do duyệt/từ chối').optional()
}).strict();

export const confirmTransferSchema = z.object({
    bankTransactionRef: z.string().min(5, 'Mã giao dịch ngân hàng không hợp lệ')
}).strict();

export const failTransferSchema = z.object({
    reason: z.string().min(10, 'Phải cung cấp lý do chi tiết để Organizer biết đường sửa STK')
}).strict();

export const listRequestsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ').optional(),
    status: z.string().optional()
});

export const disbursementParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Disbursement ID không hợp lệ')
}).strict();

export const updateHoldRequestSchema = z.object({
    bankAccountId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Tài khoản ngân hàng không hợp lệ')
}).strict();

export const adminListDisbursementQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ').optional(),
    status: z.enum(['PENDING', 'PARTIALLY_APPROVED', 'APPROVED_PENDING_TRANSFER', 'COMPLETED', 'REJECTED', 'HOLD']).optional()
}).strict();