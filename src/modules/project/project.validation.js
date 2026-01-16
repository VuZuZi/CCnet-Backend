import Joi from 'joi';

export const createProjectSchema = Joi.object({
  title: Joi.string().min(3).max(200).required().messages({
    'string.min': 'Title must be at least 3 characters',
    'string.max': 'Title must not exceed 200 characters',
    'any.required': 'Title is required'
  }),
  description: Joi.string().max(5000).allow('', null).messages({
    'string.max': 'Description must not exceed 5000 characters'
  }),
  financialGoal: Joi.number().min(0).precision(2).messages({
    'number.min': 'Financial goal must be a positive number'
  }),
  startDate: Joi.date().allow(null).messages({
    'date.base': 'Start date must be a valid date'
  }),
  endDate: Joi.date().greater(Joi.ref('startDate')).allow(null).messages({
    'date.base': 'End date must be a valid date',
    'date.greater': 'End date must be after start date'
  }),
  status: Joi.string().valid('draft', 'pending', 'active', 'completed', 'cancelled').messages({
    'any.only': 'Status must be one of: draft, pending, active, completed, cancelled'
  })
});

export const updateProjectSchema = Joi.object({
  title: Joi.string().min(3).max(200).messages({
    'string.min': 'Title must be at least 3 characters',
    'string.max': 'Title must not exceed 200 characters'
  }),
  description: Joi.string().max(5000).allow('', null).messages({
    'string.max': 'Description must not exceed 5000 characters'
  }),
  financialGoal: Joi.number().min(0).precision(2).messages({
    'number.min': 'Financial goal must be a positive number'
  }),
  currentAmount: Joi.number().min(0).precision(2).messages({
    'number.min': 'Current amount must be a positive number'
  }),
  startDate: Joi.date().allow(null).messages({
    'date.base': 'Start date must be a valid date'
  }),
  endDate: Joi.date().allow(null).messages({
    'date.base': 'End date must be a valid date'
  }),
  status: Joi.string().valid('draft', 'pending', 'active', 'completed', 'cancelled').messages({
    'any.only': 'Status must be one of: draft, pending, active, completed, cancelled'
  }),
  volunteerId: Joi.string().allow(null).messages({
    'string.base': 'Volunteer ID must be a valid string'
  })
});

export const getProjectsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid('draft', 'pending', 'active', 'completed', 'cancelled'),
  sortBy: Joi.string().valid('createdAt', 'title', 'financialGoal', 'startDate').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const projectIdParamSchema = Joi.object({
  id: Joi.string().required().messages({
    'any.required': 'Project ID is required'
  })
});
