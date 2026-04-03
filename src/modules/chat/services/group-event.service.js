import { normalizeParticipantIds } from '../utils/participant.util.js';
import { saveConversationDocument } from '../utils/conversation.util.js';

export default class ChatGroupEventService {
  constructor({
    conversationRepository,
    messageRepository,
    publishService,
  }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.publishService = publishService;
  }

  async emitSystemMessage({
    conversation,
    text,
    action = 'member_added',
    actorId = null,
    targetUserIds = [],
    extraParticipantIds = [],
  }) {
    const normalizedTargets = normalizeParticipantIds(targetUserIds);

    const systemMessage = await this.messageRepository.create({
      conversationId: conversation._id,
      senderId: null,
      messageType: 'system',
      text: String(text || '').trim(),
      attachments: [],
      links: [],
      replyTo: null,
      reactions: [],
      status: 'sent',
      seenBy: [],
      meta: {
        kind: 'group_event',
        action,
        actorId: actorId || null,
        targetUserIds: normalizedTargets,
      },
    });

    conversation.lastMessage = systemMessage._id;

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    const populated = await this.messageRepository.findByIdPopulated(systemMessage._id);

    const notifyUserIds = normalizeParticipantIds([
      ...(conversation.participants || []),
      ...normalizedTargets,
      ...extraParticipantIds,
      actorId,
    ]);

    await this.publishService.publishNewMessage({
      conversationId: conversation._id,
      message: populated,
      participantIds: notifyUserIds,
    });

    return populated;
  }
}