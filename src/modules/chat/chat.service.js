import mongoose from 'mongoose';
import AppError from '../../core/AppError.js';

const CHAT_NEW_MESSAGE_CHANNEL = 'chat:message:new';

class ChatService {
  constructor({ conversationRepository, messageRepository, redis }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.redis = redis; 
  }

  async createOrGetConversation(userId, participantId) {
    if (!participantId) throw new AppError('Participant ID is required', 400);
    if (String(participantId) === String(userId)) {
      throw new AppError('Cannot create conversation with yourself', 400);
    }

    let convo = await this.conversationRepository.findDirectConversation(userId, participantId);
    if (!convo) {
      convo = await this.conversationRepository.createDirectConversation(userId, participantId);
    }
    return convo;
  }

  async getUserConversations(userId) {
    return this.conversationRepository.findUserConversations(userId);
  }

  async getConversationMessages(conversationId, userId, limit = 50) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError('Invalid conversationId format', 400);
    }

    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) throw new AppError('Conversation not found', 404);

    const isMember = (convo.participants || []).some((p) => String(p) === String(userId));
    if (!isMember) throw new AppError('Forbidden', 403);

    return this.messageRepository.findConversationMessages(conversationId, limit);
  }

  async sendMessage(conversationId, senderId, text, attachments = [], hostBaseUrl = null) {
    if (!conversationId) throw new AppError('Conversation ID is required', 400);
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError('Invalid conversationId format', 400);
    }

    const hasText = !!(text && String(text).trim());
    const hasAttach = Array.isArray(attachments) && attachments.length > 0;
    if (!hasText && !hasAttach) {
      throw new AppError('Message text or attachments is required', 400);
    }

    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) throw new AppError('Conversation not found', 404);

    const participantIds = (convo.participants || []).map((p) => String(p));
    if (!participantIds.includes(String(senderId))) throw new AppError('Forbidden', 403);

    const normalizedAttachments = (attachments || []).map((a) => {
      const url = hostBaseUrl
        ? `${hostBaseUrl}/api/v1/chat/files/${encodeURIComponent(a.filename)}`
        : a.filename;

      return {
        originalName: a.originalName,
        mimetype: a.mimetype,
        size: a.size,
        url,
      };
    });

    const msg = await this.messageRepository.create({
      conversationId,
      senderId,
      text: hasText ? String(text).trim() : '',
      attachments: normalizedAttachments,
      status: 'sent',
    });

    const unreadCounts = convo.unreadCounts || {};
    for (const pid of participantIds) {
      unreadCounts[pid] = pid === String(senderId) ? 0 : (unreadCounts[pid] || 0) + 1;
    }

    convo.lastMessage = msg._id;
    convo.unreadCounts = unreadCounts;
    await this.conversationRepository.save(convo);

    const populated = await this.messageRepository.findByIdPopulated(msg._id);

    try {
      const payload = JSON.stringify({
        conversationId: String(conversationId),
        message: populated,
        participantIds,
      });

      await this.redis.publish(CHAT_NEW_MESSAGE_CHANNEL, payload);
    } catch (e) {
      console.error('[chat publish] failed', e?.message || e);
    }

    return populated;
  }

  async markAsRead(conversationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError('Invalid conversationId format', 400);
    }

    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) throw new AppError('Conversation not found', 404);

    const participantIds = (convo.participants || []).map((p) => String(p));
    if (!participantIds.includes(String(userId))) {
      throw new AppError('Forbidden: user not participant', 403);
    }

    await this.conversationRepository.setUnreadCount(conversationId, String(userId), 0);
    return { success: true };
  }
}

export default ChatService;
