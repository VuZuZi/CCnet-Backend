import Joi from 'joi';

const objectId = Joi.string().length(24).hex();

export const idParamSchema = Joi.object({
  id: objectId.required(),
});

export const listFollowingSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
});
