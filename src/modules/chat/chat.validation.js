import Joi from 'joi';

const objectId = Joi.string().length(24).hex();

export const createConversationSchema = Joi.object({
  participantId: objectId.required(),
});

export const getMessagesSchema = Joi.object({
  id: objectId.required(),
});

export const sendMessageSchema = Joi.object({
  conversationId: objectId.required(),
  text: Joi.string().allow('').optional(),
}).unknown(true);

export const markAsReadSchema = Joi.object({
  id: objectId.required(),
});

export const downloadFileSchema = Joi.object({
  filename: Joi.string().required(),
});
