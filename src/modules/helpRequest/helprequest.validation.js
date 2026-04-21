import { z } from 'zod';

const CATEGORIES = ['Y_TE', 'GIAO_DUC', 'THIEN_TAI', 'XAY_DUNG', 'MOI_TRUONG', 'KHAC'];
const URGENCY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['PENDING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'];

const locationSchema = z.object({
  type: z.literal('Point').optional().default('Point'),
  coordinates: z.array(z.number()).length(2).optional().default([0, 0]),
  address: z.string().max(500).optional(),
});

const evidenceSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  mediaType: z.enum(['image', 'video', 'document']).optional().default('image'),
  originalName: z.string().optional(),
});

export const createHelpRequestSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(10, 'Title must be at least 10 characters')
      .max(200, 'Title cannot exceed 200 characters'),
    story: z
      .string()
      .min(50, 'Story must be at least 50 characters')
      .max(5000, 'Story cannot exceed 5000 characters'),
    category: z.enum(CATEGORIES, {
      errorMap: () => ({ message: 'Invalid category' }),
    }),
    location: locationSchema.optional(),
    urgencyLevel: z.enum(URGENCY_LEVELS).optional().default('MEDIUM'),
    amountNeeded: z.number().min(0).optional().default(0),
    evidences: z.array(evidenceSchema).max(10).optional().default([]),
    contactPhone: z.string().max(20).optional(),
    contactEmail: z.string().email().optional(),
  }),
});

export const updateHelpRequestSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(10, 'Title must be at least 10 characters')
      .max(200, 'Title cannot exceed 200 characters')
      .optional(),
    story: z
      .string()
      .min(50, 'Story must be at least 50 characters')
      .max(5000, 'Story cannot exceed 5000 characters')
      .optional(),
    category: z
      .enum(CATEGORIES, {
        errorMap: () => ({ message: 'Invalid category' }),
      })
      .optional(),
    location: locationSchema.optional(),
    urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
    amountNeeded: z.coerce.number().min(0).optional(),
    evidences: z.array(evidenceSchema).max(10).optional(),
    contactPhone: z.string().max(20).optional(),
    contactEmail: z.string().email().optional().or(z.literal('')),
  }),
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
});

export const getHelpRequestsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().default('1'),
    limit: z.string().regex(/^\d+$/).optional().default('10'),
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
    search: z.string().max(100).optional(),
    sortBy: z.enum(['createdAt', 'urgencyLevel', 'amountNeeded']).optional().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
});

export const getOrganizerAssignedRequestsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().default('1'),
    limit: z.string().regex(/^\d+$/).optional().default('10'),
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
    search: z.string().max(100).optional(),
    sortBy: z
      .enum(['assignedAt', 'createdAt', 'urgencyLevel', 'amountNeeded'])
      .optional()
      .default('assignedAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
});

export const getHelpRequestByIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
});

export const deleteHelpRequestSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
});

export const verifyHelpRequestSchema = z.object({
  body: z.object({
    approved: z.boolean(),
    rejectionReason: z.string().max(1000).optional(),
  }),
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
});

export const assignOrganizerSchema = z.object({
  body: z.object({
    organizerId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid organizer ID'),
  }),
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
});

export const getOrganizerSuggestionsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
  query: z.object({
    search: z.string().max(100).optional(),
    limit: z.string().regex(/^\d+$/).optional().default('20'),
  }),
});

export const organizerRespondAssignmentSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid help request ID'),
  }),
  body: z.object({
    action: z.enum(['accept', 'reject']),
  }),
});

export const getNearbyRequestsSchema = z.object({
  query: z.object({
    lng: z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid longitude'),
    lat: z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid latitude'),
    maxDistance: z.string().regex(/^\d+$/).optional().default('50000'),
    page: z.string().regex(/^\d+$/).optional().default('1'),
    limit: z.string().regex(/^\d+$/).optional().default('10'),
  }),
});

export const getMapRequestsSchema = z.object({
  query: z.object({
    north: z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid north').optional(),
    south: z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid south').optional(),
    east: z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid east').optional(),
    west: z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid west').optional(),
    zoom: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid zoom').optional().default('6'),
    category: z.enum(CATEGORIES).optional(),
    urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
    search: z.string().max(100).optional(),
  }),
});