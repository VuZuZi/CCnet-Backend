import { z } from 'zod';
import { PAYMENT_METHODS } from './transaction.constant.js';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID không đúng định dạng ObjectId");

export const donateSchema = z.object({
    projectId: objectIdSchema,
    amount: z.coerce.number().min(2000, "Số tiền ủng hộ tối thiểu là 2.000 VNĐ"),
    paymentMethod: z.enum([PAYMENT_METHODS.BANK_TRANSFER, PAYMENT_METHODS.WALLET]).default(PAYMENT_METHODS.BANK_TRANSFER),
    isAnonymous: z.boolean().optional().default(false),
    message: z.string().max(500, "Lời nhắn tối đa 500 ký tự").optional()
}).strict();

export const supportDonationSchema = z.object({
    amount: z.coerce.number().min(2000, "Minimum support amount is 2,000 VND"),
    message: z.string().max(500, "Message must be 500 characters or less").optional()
}).strict();

export const requestRefundSchema = z.object({
    reason: z.string().max(255, "Lý do không được vượt quá 255 ký tự").optional()
}).strict();

export const withdrawSchema = z.object({
    amount: z.coerce.number().min(50000, "Số tiền rút tối thiểu là 50.000 VNĐ"),
    bankAccountId: objectIdSchema
}).strict();

export const getDonationsQuerySchema = z.object({
    page: z.coerce.number().min(1, "Page phải lớn hơn hoặc bằng 1").optional().default(1),
    limit: z.coerce.number().min(1, "Limit phải lớn hơn 0").max(50, "Limit tối đa là 50").optional().default(10)
}).strict();

export const projectIdParamSchema = z.object({
    projectId: objectIdSchema
}).strict();

export const transactionIdParamSchema = z.object({
    id: objectIdSchema
}).strict();

export const submitClaimSchema = z.object({
    amount: z.coerce.number().min(2000, "Số tiền không hợp lệ (Tối thiểu 2.000 VNĐ)"),
    bankTransactionRef: z.string().trim().max(100).optional(),
    proofImageUrl: z.string().url("URL hình ảnh không hợp lệ")
}).strict();

export const getSuspenseQuerySchema = z.object({
    page: z.coerce.number().min(1).optional().default(1),
    limit: z.coerce.number().min(1).max(50).optional().default(10),
    status: z.enum(['UNALLOCATED', 'ALLOCATED', 'REFUNDED', 'ALL']).optional().default('ALL'),
    hasClaim: z.enum(['true', 'false', 'ALL']).optional().default('ALL')
}).strict();

export const approveClaimSchema = z.object({
    claimRequestId: objectIdSchema,
    projectId: objectIdSchema
}).strict();

export const getProjectDisbursementsQuerySchema = z.object({
    page: z.coerce.number().min(1, "Page phải lớn hơn hoặc bằng 1").optional().default(1),
    limit: z.coerce.number().min(1, "Limit phải lớn hơn 0").max(50, "Limit tối đa là 50").optional().default(10)
}).strict();

export const adminRefundRequestsQuerySchema = z.object({
    page: z.coerce.number().min(1).optional().default(1),
    limit: z.coerce.number().min(1).max(50).optional().default(10),
    status: z.enum(['PENDING', 'COMPLETED', 'REJECTED', 'ALL']).optional().default('PENDING')
}).strict();

export const adminRefundDecisionSchema = z.object({
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional().default('')
}).strict();
