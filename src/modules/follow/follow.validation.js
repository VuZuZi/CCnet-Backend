import { z } from 'zod';

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().length(24, 'Invalid user ID format').regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format')
  })
});

export const listFollowingSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().optional() 
  })
});