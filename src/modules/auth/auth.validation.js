import Joi from 'joi';

export const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'any.required': 'Password is required'
  }),
  fullName: Joi.string().min(2).required().messages({
    'string.min': 'Full name must be at least 2 characters',
    'any.required': 'Full name is required'
  })
});

export const verifyOTPSchema = Joi.object({
  userId: Joi.string().required(),
  otp: Joi.string().length(6).required().messages({
    'string.length': 'OTP must be 6 digits',
    'any.required': 'OTP is required'
  })
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});