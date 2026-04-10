import { z } from 'zod';

export const addBankSchema = z.object({
    bankName: z.string().min(2, "Tên ngân hàng không hợp lệ").max(100),
    accountNumber: z.string().min(5, "Số tài khoản quá ngắn").max(50),
    accountName: z.string().min(2, "Tên chủ tài khoản không hợp lệ").max(150)
}).strict();

export const verifyBankSchema = z.object({
    amount: z.coerce.number().int().min(1000, "Số tiền đối chiếu không hợp lệ").max(9999)
}).strict();