import { normalizeParticipantIds } from '../utils/participant.util.js';
import { CHAT_CHANNELS } from '../chat.constants.js';

const CHANNELS = {
  NEW_MESSAGE: CHAT_CHANNELS?.NEW_MESSAGE || 'chat:message:new',
  UPDATED_MESSAGE: CHAT_CHANNELS?.UPDATED_MESSAGE || 'chat:message:updated',
  MESSAGE_READ: CHAT_CHANNELS?.MESSAGE_READ || 'chat:message:read',
  CONVERSATION_UPDATED:
    CHAT_CHANNELS?.CONVERSATION_UPDATED || 'chat:conversation:updated',
  PINNED_MESSAGE: CHAT_CHANNELS?.PINNED_MESSAGE || 'chat:message:pinned',
  UNPINNED_MESSAGE: CHAT_CHANNELS?.UNPINNED_MESSAGE || 'chat:message:unpinned',
};

export default class ChatPublishService {
  constructor({ redis }) {
    this.redis = redis;
  }

  async publishNewMessage({ conversationId, message, participantIds = [] }) {
    const safeParticipantIds = normalizeParticipantIds(participantIds);

    await this.redis.publish(
      CHANNELS.NEW_MESSAGE,
      JSON.stringify({
        conversationId: String(conversationId),
        message,
        participantIds: safeParticipantIds,
      })
    );
  }

  async publishUpdatedMessage({ conversationId, message, participantIds = [] }) {
    const safeParticipantIds = normalizeParticipantIds(participantIds);

    await this.redis.publish(
      CHANNELS.UPDATED_MESSAGE,
      JSON.stringify({
        conversationId: String(conversationId),
        message,
        participantIds: safeParticipantIds,
      })
    );
  }

  async publishConversationUpdated({ conversation, participantIds = [] }) {
    const safeParticipantIds = normalizeParticipantIds(participantIds);

    await this.redis.publish(
      CHANNELS.CONVERSATION_UPDATED,
      JSON.stringify({
        conversationId: String(conversation?._id || ''),
        conversation,
        participantIds: safeParticipantIds,
      })
    );
  }

  async publishReadMessage(payload) {
    const safeParticipantIds = normalizeParticipantIds(payload?.participantIds || []);

    await this.redis.publish(
      CHANNELS.MESSAGE_READ,
      JSON.stringify({
        ...payload,
        conversationId: String(payload?.conversationId || ''),
        messageId: String(payload?.messageId || payload?.lastReadMessageId || ''),
        lastReadMessageId: String(payload?.lastReadMessageId || payload?.messageId || ''),
        participantIds: safeParticipantIds,
      })
    );
  }

  async publishPinnedMessage({ conversationId, pin, participantIds = [] }) {
    const safeParticipantIds = normalizeParticipantIds(participantIds);

    await this.redis.publish(
      CHANNELS.PINNED_MESSAGE,
      JSON.stringify({
        conversationId: String(conversationId || ''),
        pin,
        messageId: String(pin?.messageId || pin?.message?._id || ''),
        participantIds: safeParticipantIds,
      })
    );
  }

  async publishUnpinnedMessage({
    conversationId,
    messageId,
    participantIds = [],
  }) {
    const safeParticipantIds = normalizeParticipantIds(participantIds);

    await this.redis.publish(
      CHANNELS.UNPINNED_MESSAGE,
      JSON.stringify({
        conversationId: String(conversationId || ''),
        messageId: String(messageId || ''),
        participantIds: safeParticipantIds,
      })
    );
  }
}