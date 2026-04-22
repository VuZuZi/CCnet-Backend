import { z } from 'zod';

export const syncMediaSchema = z.object({
    originalName: z.string().min(1, 'Tên file không được để trống'),
    publicId: z.string().min(1, 'Public ID là bắt buộc'),
    url: z.string().url('URL không hợp lệ'),
    mimetype: z.string().min(1, 'Mimetype là bắt buộc'),
    size: z.number().positive('Size phải lớn hơn 0'),
    width: z.number().default(0),
    height: z.number().default(0),
    context: z.enum(['avatar', 'post', 'comment', 'general', 'cover', 'project_document', 'project_cover', 'organizer_kyc', 'milestone_evidence', 'project_receipt']).default('general')
}).strict();

export const deleteMediaSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID Media không hợp lệ')
}).strict();