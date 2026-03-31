// src/modules/chat/chat.service.js
import mongoose from 'mongoose';
import AppError from '../../core/AppError.js';

const CHAT_NEW_MESSAGE_CHANNEL = 'chat:message:new';
const CHAT_TYPING_CHANNEL = 'chat:typing';
const CHAT_READ_RECEIPT_CHANNEL = 'chat:read:receipt';

class ChatService {
  constructor({ conversationRepository, messageRepository, redis }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.redis = redis;
  }

  async createOrGetConversation(userId, participantId) {
    if (!participantId) {
      throw new AppError('Participant ID is required', 400);
    }

    if (String(participantId) === String(userId)) {
      throw new AppError('Cannot create conversation with yourself', 400);
    }

    let convo = await this.conversationRepository.findDirectConversation(
        userId,
        participantId
    );

    if (!convo) {
      convo = await this.conversationRepository.createDirectConversation(
          userId,
          participantId
      );
    }

    return convo;
  }

  /**
   * Tạo hoặc lấy group chat (cho project)
   */
  async createOrGetGroupConversation(userId, projectId, projectName, participantIds = []) {
    if (!projectId) {
      throw new AppError('Project ID is required', 400);
    }

    // Kiểm tra group chat đã tồn tại chưa
    let convo = await this.conversationRepository.findByProjectId(projectId);

    if (!convo) {
      // Thêm userId vào participantIds nếu chưa có
      const allParticipants = [...new Set([userId, ...participantIds])];

      convo = await this.conversationRepository.createGroupConversation({
        name: projectName,
        projectId,
        participants: allParticipants,
        createdBy: userId,
        isGroupChat: true,
      });
    }

    return convo;
  }

  /**
   * Thêm người dùng vào group chat
   */
  async addParticipantsToGroup(conversationId, userId, newParticipantIds) {
    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) {
      throw new AppError('Conversation not found', 404);
    }

    if (!convo.isGroupChat) {
      throw new AppError('Cannot add participants to direct chat', 400);
    }

    const isCreator = String(convo.createdBy) === String(userId);
    if (!isCreator) {
      throw new AppError('Only group creator can add participants', 403);
    }

    const currentParticipants = convo.participants.map(p => String(p));
    const participantsToAdd = newParticipantIds.filter(
        id => !currentParticipants.includes(String(id))
    );

    if (participantsToAdd.length === 0) {
      return convo;
    }

    convo.participants = [...currentParticipants, ...participantsToAdd];
    await this.conversationRepository.save(convo);

    // Gửi thông báo qua Redis
    await this.redis.publish(CHAT_NEW_MESSAGE_CHANNEL, {
      type: 'participants_added',
      conversationId: String(conversationId),
      addedParticipants: participantsToAdd,
      addedBy: userId,
    });

    return convo;
  }

  async getUserConversations(userId) {
    return this.conversationRepository.findUserConversations(userId);
  }

  async getConversationMessages(conversationId, userId, limit = 50, before = null) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError('Invalid conversationId format', 400);
    }

    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) {
      throw new AppError('Conversation not found', 404);
    }

    const isMember = (convo.participants || []).some(
        (p) => String(p) === String(userId)
    );

    if (!isMember) {
      throw new AppError('Forbidden', 403);
    }

    // Lấy messages với phân trang (load more)
    return this.messageRepository.findConversationMessages(conversationId, limit, before);
  }

  async sendMessage(
      conversationId,
      senderId,
      text,
      attachments = [],
      hostBaseUrl = null
  ) {
    if (!conversationId) {
      throw new AppError('Conversation ID is required', 400);
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError('Invalid conversationId format', 400);
    }

    const hasText = !!(text && String(text).trim());
    const hasAttach = Array.isArray(attachments) && attachments.length > 0;

    if (!hasText && !hasAttach) {
      throw new AppError('Message text or attachments is required', 400);
    }

    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) {
      throw new AppError('Conversation not found', 404);
    }

    const participantIds = (convo.participants || []).map((p) => String(p));

    if (!participantIds.includes(String(senderId))) {
      throw new AppError('Forbidden', 403);
    }

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

    // Cập nhật unread counts cho tất cả participants (trừ người gửi)
    const currentUnreadCounts =
        convo.unreadCounts instanceof Map
            ? Object.fromEntries(convo.unreadCounts.entries())
            : typeof convo.unreadCounts?.entries === 'function'
                ? Object.fromEntries(convo.unreadCounts.entries())
                : { ...(convo.unreadCounts || {}) };

    for (const pid of participantIds) {
      currentUnreadCounts[pid] =
          pid === String(senderId) ? 0 : (Number(currentUnreadCounts[pid]) || 0) + 1;
    }

    convo.lastMessage = msg._id;
    convo.unreadCounts = currentUnreadCounts;
    convo.updatedAt = new Date();

    await this.conversationRepository.save(convo);

    const populated = await this.messageRepository.findByIdPopulated(msg._id);

    // Gửi realtime notification qua Redis
    try {
      const payload = {
        type: 'new_message',
        conversationId: String(conversationId),
        message: populated,
        participantIds,
        senderId: String(senderId),
        timestamp: new Date().toISOString(),
      };

      const receivers = await this.redis.publish(CHAT_NEW_MESSAGE_CHANNEL, payload);

      console.log('[chat publish] channel=', CHAT_NEW_MESSAGE_CHANNEL);
      console.log('[chat publish] messageId=', populated?._id);
      console.log('[chat publish] conversationId=', String(conversationId));
      console.log('[chat publish] receivers=', receivers);
    } catch (e) {
      console.error('[chat publish] failed', e?.message || e);
    }

    return populated;
  }

  /**
   * Gửi typing indicator
   */
  async sendTypingIndicator(conversationId, userId, isTyping) {
    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) {
      throw new AppError('Conversation not found', 404);
    }

    const isMember = (convo.participants || []).some(p => String(p) === String(userId));
    if (!isMember) {
      throw new AppError('Forbidden', 403);
    }

    const payload = {
      type: 'typing',
      conversationId: String(conversationId),
      userId: String(userId),
      isTyping,
      timestamp: new Date().toISOString(),
    };

    await this.redis.publish(CHAT_TYPING_CHANNEL, payload);
    return { success: true };
  }

  async markAsRead(conversationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new AppError('Invalid conversationId format', 400);
    }

    const convo = await this.conversationRepository.findById(conversationId);
    if (!convo) {
      throw new AppError('Conversation not found', 404);
    }

    const participantIds = (convo.participants || []).map((p) => String(p));

    if (!participantIds.includes(String(userId))) {
      throw new AppError('Forbidden: user not participant', 403);
    }

    await this.conversationRepository.setUnreadCount(
        conversationId,
        String(userId),
        0
    );

    // Cập nhật trạng thái đã đọc cho tin nhắn
    await this.messageRepository.markMessagesAsRead(conversationId, userId);

    // Gửi read receipt qua Redis
    const payload = {
      type: 'read_receipt',
      conversationId: String(conversationId),
      userId: String(userId),
      timestamp: new Date().toISOString(),
    };

    await this.redis.publish(CHAT_READ_RECEIPT_CHANNEL, payload);

    return { success: true };
  }

  /**
   * Xóa tin nhắn (soft delete)
   */
  async deleteMessage(messageId, userId) {
    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      throw new AppError('Message not found', 404);
    }

    const convo = await this.conversationRepository.findById(message.conversationId);
    if (!convo) {
      throw new AppError('Conversation not found', 404);
    }

    const isSender = String(message.senderId) === String(userId);
    const isGroupAdmin = convo.isGroupChat && String(convo.createdBy) === String(userId);

    if (!isSender && !isGroupAdmin) {
      throw new AppError('You can only delete your own messages', 403);
    }

    await this.messageRepository.softDelete(messageId);

    return { success: true };
  }

  /**
   * Lấy danh sách người dùng online
   */
  async getOnlineUsers(userIds) {
    // Implement với Redis
    const onlineUsers = [];
    for (const userId of userIds) {
      const isOnline = await this.redis.get(`user:${userId}:online`);
      if (isOnline) {
        onlineUsers.push(userId);
      }
    }
    return onlineUsers;
  }
}

export default ChatService;