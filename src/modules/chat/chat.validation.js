import Joi from 'joi';
import {
  CHAT_ASSET_TYPES,
  CHAT_CONVERSATION_TYPES,
} from './chat.constants.js';
import { CHAT_UPLOAD_LIMITS } from './chat.upload.constants.js';

const objectId = Joi.string().length(24).hex();

export const createConversationSchema = Joi.object({
  type: Joi.string()
    .valid(
      CHAT_CONVERSATION_TYPES.DIRECT,
      CHAT_CONVERSATION_TYPES.GROUP
    )
    .default(CHAT_CONVERSATION_TYPES.DIRECT),
  participantId: objectId.when('type', {
    is: CHAT_CONVERSATION_TYPES.DIRECT,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  participantIds: Joi.alternatives().try(
    Joi.array().items(objectId),
    Joi.string()
  ).when('type', {
    is: CHAT_CONVERSATION_TYPES.GROUP,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  groupName: Joi.string().max(100).allow('').when('type', {
    is: CHAT_CONVERSATION_TYPES.GROUP,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  projectId: objectId.allow(null, '').optional(),
});

export const getMessagesSchema = Joi.object({
  id: objectId.required(),
});

export const sendMessageSchema = Joi.object({
  conversationId: objectId.required(),
  text: Joi.string().allow('').optional(),
  replyTo: objectId.allow(null, '').optional(),
  attachmentsCount: Joi.number()
    .integer()
    .min(0)
    .max(CHAT_UPLOAD_LIMITS.maxFiles)
    .default(0),
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

export const reactMessageSchema = Joi.object({
  id: objectId.required(),
  emoji: Joi.string().trim().min(1).max(10).required(),
});

export const unsendMessageSchema = Joi.object({
  id: objectId.required(),
});

export const markAsReadSchema = Joi.object({
  id: objectId.required(),
});

export const updateConversationSchema = Joi.object({
  id: objectId.required(),
  groupName: Joi.string().max(100).allow('').optional(),
});

export const getAssetsSchema = Joi.object({
  id: objectId.required(),
  type: Joi.string()
    .valid(
      CHAT_ASSET_TYPES.IMAGE,
      CHAT_ASSET_TYPES.FILE,
      CHAT_ASSET_TYPES.LINK
    )
    .required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(30),
});

export const manageMembersSchema = Joi.object({
  id: objectId.required(),
  participantIds: Joi.alternatives().try(
    Joi.array().items(objectId).min(1),
    Joi.string()
  ).required(),
});

export const leaveConversationSchema = Joi.object({
  id: objectId.required(),
});

export const getPinnedMessagesSchema = Joi.object({
  id: objectId.required(),
});

export const pinMessageSchema = Joi.object({
  id: objectId.required(),
  messageId: objectId.required(),
});

export const unpinMessageSchema = Joi.object({
  id: objectId.required(),
  messageId: objectId.required(),
});