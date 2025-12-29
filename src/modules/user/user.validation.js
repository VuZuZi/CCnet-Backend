import Joi from 'joi';

export const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(2).optional().messages({
    'string.min': 'Full name must be at least 2 characters',
    'any.required': 'Full name is required'
    }),
    phone: Joi.string().pattern(/^\+?[0-9\s\-]{7,15}$/).optional().messages({
    'string.pattern.base': 'Phone number is not valid',
    'any.required': 'Phone number is required'
    }),
    location: Joi.string().max(100).optional().messages({
    'string.max': 'Location must be at most 100 characters',
    'any.required': 'Location is required'
    }),
    bio: Joi.string().max(500).optional().messages({
    'string.max': 'Bio must be at most 500 characters',
    'any.required': 'Bio is required'
    })
});