import AppError from '../../../core/AppError.js';
import { normalizeParticipantIds } from '../utils/participant.util.js';
import { saveConversationDocument } from '../utils/conversation.util.js';
import { requireConversationParticipant } from './helpers/conversation-access.helper.js';

export default class MessageService {
  constructor({
    conversationRepository,
    messageRepository,
    publishService,
  }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.publishService = publishService;
  }

  async getAssets(payload) {
    const { id, type, page, limit, currentUserId } = payload;

    await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    return this.messageRepository.findConversationAssetMessagesPage(id, {
      type,
      page,
      limit,
    });
  }

  async getMessages(payload) {
    const { id, currentUserId } = payload;

    await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    return this.messageRepository.findConversationMessages(id);
  }

  async sendMessage(payload) {
    const {
      conversationId,
      text = '',
      attachments = [],
      replyTo = null,
      currentUserId,
    } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      conversationId,
      currentUserId
    );

    let replyToMessageId = null;

    if (replyTo) {
      const replyMessage = await this.messageRepository.findByIdLean(replyTo);

      if (!replyMessage || String(replyMessage.conversationId) !== String(conversationId)) {
        throw new AppError('Reply target is invalid', 400);
      }

      replyToMessageId = replyTo;
    }

    const createdMessage = await this.messageRepository.create({
      conversationId,
      senderId: currentUserId,
      text: String(text || '').trim(),
      attachments,
      links: [],
      replyTo: replyToMessageId,
      reactions: [],
      seenBy: [],
      status: 'sent',
      messageType: 'user',
      isUnsent: false,
    });

    conversation.lastMessage = createdMessage._id;

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    const populatedMessage = await this.messageRepository.findByIdPopulated(createdMessage._id);

    await this.publishService.publishNewMessage({
      conversationId,
      message: populatedMessage,
      participantIds: normalizeParticipantIds(conversation.participants || []),
    });

    return populatedMessage;
  }

  async reactMessage(payload) {
    const { id, emoji, currentUserId } = payload;

    const message = await this.messageRepository.findById(id);
    if (!message) {
      throw new AppError('Message not found', 404);
    }

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      message.conversationId,
      currentUserId
    );

    const existingIndex = (message.reactions || []).findIndex(
      (item) =>
        String(item?.userId || '') === String(currentUserId) &&
        String(item?.emoji || '') === String(emoji || '')
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions = Array.isArray(message.reactions) ? message.reactions : [];
      message.reactions.push({
        userId: currentUserId,
        emoji: String(emoji || '').trim(),
        reactedAt: new Date(),
      });
    }

    await this.messageRepository.save(message);

    const updatedMessage = await this.messageRepository.findByIdPopulated(message._id);

    await this.publishService.publishUpdatedMessage({
      conversationId: message.conversationId,
      message: updatedMessage,
      participantIds: normalizeParticipantIds(conversation.participants || []),
    });

    return updatedMessage;
  }

  async unsendMessage(payload) {
    const { id, currentUserId } = payload;

    const message = await this.messageRepository.findById(id);
    if (!message) {
      throw new AppError('Message not found', 404);
    }

    if (String(message.senderId || '') !== String(currentUserId)) {
      throw new AppError('You can only unsend your own message', 403);
    }

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      message.conversationId,
      currentUserId
    );

    message.text = '';
    message.attachments = [];
    message.links = [];
    message.isUnsent = true;
    message.unsentAt = new Date();
    message.reactions = [];

    await this.messageRepository.save(message);

    const updatedMessage = await this.messageRepository.findByIdPopulated(message._id);

    await this.publishService.publishUpdatedMessage({
      conversationId: message.conversationId,
      message: updatedMessage,
      participantIds: normalizeParticipantIds(conversation.participants || []),
    });

    return updatedMessage;
  }
}