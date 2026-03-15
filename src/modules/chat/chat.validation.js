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
  attachmentsCount: Joi.number().integer().min(0).default(0),
})
  .custom((value, helpers) => {
    const hasText = !!String(value.text || '').trim();
    const hasAttachments = Number(value.attachmentsCount || 0) > 0;

    if (!hasText && !hasAttachments) {
      return helpers.error('any.custom');
    }

    return value;
  }, 'message content validation')
  .messages({
    'any.custom': 'Message text or attachments is required',
  });

export const markAsReadSchema = Joi.object({
  id: objectId.required(),
});

export const downloadFileSchema = Joi.object({
  filename: Joi.string().required(),
});