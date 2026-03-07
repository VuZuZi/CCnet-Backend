import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ID format",
});

export const PostValidation = {
  createPost: z.object({
    body: z.object({
      content: z.string().max(5000, "Content exceeds 5000 characters").optional(),
      privacy: z.enum(['public', 'friends', 'private']).default('public'),
    }).refine(data => data.content !== undefined, {
      message: "Post must have content",
      path: ["content"]
    })
  }),

  toggleReaction: z.object({
    params: z.object({ id: objectId }),
    body: z.object({
      type: z.enum(['like', 'dislike'])
    })
  }),

  addComment: z.object({
    params: z.object({ id: objectId }),
    body: z.object({
      content: z.string().min(1, "Comment cannot be empty").max(2000, "Comment too long")
    })
  }),

  pagination: z.object({
    query: z.object({
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
      cursor: objectId.optional(),
      page: z.string().regex(/^\d+$/).transform(Number).optional()
    })
  }),
  
  paramsId: z.object({
      params: z.object({ id: objectId })
  })
};