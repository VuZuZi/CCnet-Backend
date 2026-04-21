import { z } from 'zod';

export const getFinancialSummaryQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    status: z.string().optional(),
    search: z.string().optional()
}).strict();

export const getFinancialDetailParamsSchema = z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Dự án không hợp lệ')
}).strict();