import { normalizeParticipantIds } from '../utils/participant.util.js';
import { getConversationUnreadCountsMap } from '../utils/conversation.util.js';
import { requireConversationParticipant } from './helpers/conversation-access.helper.js';

export default class ReadService {
  constructor({
    conversationRepository,
    messageRepository,
    publishService,
  }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.publishService = publishService;
  }

  async markAsRead({ conversationId, currentUserId, reader }) {
    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      conversationId,
      currentUserId
    );

    const unreadMessageItems =
      await this.messageRepository.findUnreadMessageIdsForUser({
        conversationId,
        currentUserId,
        limit: 200,
      });

    const unreadMessageIds = unreadMessageItems.map((item) => String(item._id));

    const unreadCounts = getConversationUnreadCountsMap(conversation);
    unreadCounts.set(String(currentUserId), 0);
    conversation.unreadCounts = unreadCounts;

    if (!unreadMessageIds.length) {
      await this.conversationRepository.save(conversation);

      return {
        success: true,
        conversationId: String(conversationId),
        changedMessageIds: [],
        messageId: '',
        lastReadMessageId: '',
        participantIds: normalizeParticipantIds(conversation.participants || []),
      };
    }

    const seenAt = new Date();

    await this.messageRepository.markMessagesAsSeen({
      messageIds: unreadMessageIds,
      currentUserId,
      seenAt,
    });

    await this.conversationRepository.save(conversation);

    const lastReadMessageId = String(unreadMessageIds[0] || '');

    const result = {
      success: true,
      conversationId: String(conversationId),
      changedMessageIds: unreadMessageIds,
      messageId: lastReadMessageId,
      lastReadMessageId,
      participantIds: normalizeParticipantIds(conversation.participants || []),
      reader,
    };

    await this.publishService.publishReadMessage({
      conversationId: result.conversationId,
      messageId: result.messageId,
      lastReadMessageId: result.lastReadMessageId,
      participantIds: result.participantIds,
      reader,
    });

    return result;
  }
}