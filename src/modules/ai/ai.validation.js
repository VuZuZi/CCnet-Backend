import { z } from 'zod';

export const testChatSchema = z.object({
    userMessage: z.string().min(1, 'Tin nhắn không được để trống'),
    systemPrompt: z.string().optional(),
    
    modelId: z.string().optional(),
});