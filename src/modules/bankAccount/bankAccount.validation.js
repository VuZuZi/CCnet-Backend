import { z } from 'zod';
import { getSupportedBankNames } from './bankAccount.constant.js';

const supportedBankNames = getSupportedBankNames();

export const addBankSchema = z.object({
    bankName: z.string()
        .trim()
        .refine((val) => supportedBankNames.includes(val), {
            message: `Ngân hàng không được hỗ trợ. Các ngân hàng hợp lệ: ${supportedBankNames.join(', ')}`
        }),
    accountNumber: z.string().trim().min(5, "Số tài khoản quá ngắn").max(50),
    accountName: z.string().trim().min(2, "Tên chủ tài khoản không hợp lệ").max(150)
}).strict();

export const verifyBankSchema = z.object({
    amount: z.coerce.number().int().min(1000, "Số tiền đối chiếu không hợp lệ").max(9999)
}).strict();