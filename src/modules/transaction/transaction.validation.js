import { z } from 'zod';
import { PAYMENT_METHODS } from './transaction.constant.js';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID không đúng định dạng ObjectId");

export const donateSchema = z.object({
    projectId: objectIdSchema,
    amount: z.coerce.number().min(2000, "Số tiền nạp tối thiểu là 2.000 VNĐ"),
    paymentMethod: z.enum(Object.values(PAYMENT_METHODS)).default(PAYMENT_METHODS.PAYOS),
    cancelUrl: z.string().url("cancelUrl phải là một URL hợp lệ").optional(),
    returnUrl: z.string().url("returnUrl phải là một URL hợp lệ").optional(),
    isAnonymous: z.boolean().optional().default(false)
}).strict().refine(data => {
    if (data.paymentMethod === PAYMENT_METHODS.PAYOS && (!data.cancelUrl || !data.returnUrl)) {
        return false;
    }
    return true;
}, {
    message: "cancelUrl và returnUrl là bắt buộc khi thanh toán qua PayOS",
    path: ["paymentMethod"]
});

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