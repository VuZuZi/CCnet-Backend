import { normalizeParticipantIds } from '../utils/participant.util.js';
import { CHAT_CHANNELS } from '../chat.constants.js';

export default class ChatPublishService {
  constructor({ redis }) {
    this.redis = redis;
  }

  async publishNewMessage({ conversationId, message, participantIds = [] }) {
    const safeParticipantIds = normalizeParticipantIds(participantIds);

    await this.redis.publish(
      CHAT_CHANNELS.NEW_MESSAGE,
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
      CHAT_CHANNELS.UPDATED_MESSAGE,
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
      CHAT_CHANNELS.CONVERSATION_UPDATED,
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
      CHAT_CHANNELS.MESSAGE_READ,
      JSON.stringify({
        ...payload,
        conversationId: String(payload?.conversationId || ''),
        messageId: String(payload?.messageId || payload?.lastReadMessageId || ''),
        lastReadMessageId: String(payload?.lastReadMessageId || payload?.messageId || ''),
        participantIds: safeParticipantIds,
      })
    );
  }
}