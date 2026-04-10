import { z } from 'zod';

export const walletHistoryQuerySchema = z.object({
    page: z.coerce.number().int().min(1, "Page phải lớn hơn 0").optional().default(1),
    limit: z.coerce.number().int().min(1).max(50, "Limit tối đa là 50").optional().default(10)
}).strict();