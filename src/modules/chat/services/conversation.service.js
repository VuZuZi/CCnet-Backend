import AppError from '../../../core/AppError.js';
import { uniqueIds } from '../utils/id.util.js';
import {
  normalizeParticipantIds,
  pickRandomAdminCandidate,
} from '../utils/participant.util.js';
import { getDisplayName } from '../utils/user.util.js';
import {
  buildUnreadCounts,
  getConversationUnreadCountsMap,
  saveConversationDocument,
} from '../utils/conversation.util.js';
import ChatGroupEventService from './group-event.service.js';
import { CHAT_GROUP_ACTIONS } from '../chat.constants.js';
import {
  requireConversationParticipant,
  requireGroupAdmin,
  requireGroupConversation,
} from './helpers/conversation-access.helper.js';

function buildParticipantLookup(participants = []) {
  const map = new Map();

  (Array.isArray(participants) ? participants : []).forEach((item) => {
    const id = String(item?._id || item?.id || item || '');
    if (!id) return;
    map.set(id, item);
  });

  return map;
}

export default class ConversationService {
  constructor({
    conversationRepository,
    messageRepository,
    publishService,
  }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.publishService = publishService;

    this.groupEventService = new ChatGroupEventService({
      conversationRepository,
      messageRepository,
      publishService,
    });
  }

  async reloadConversation(conversationId) {
    return this.conversationRepository.findByIdPopulated(conversationId);
  }

  async emitSystemMessage(payload) {
    return this.groupEventService.emitSystemMessage(payload);
  }

  transferAdminIfNeeded(conversation) {
    let promotedAdminId = null;

    const participantIds = normalizeParticipantIds(conversation.participants || []);
    const adminIds = normalizeParticipantIds(conversation.groupAdmins || []);

    if (participantIds.length > 0 && adminIds.length === 0) {
      const nextAdmin = pickRandomAdminCandidate(participantIds);

      if (nextAdmin) {
        promotedAdminId = String(nextAdmin);
        conversation.groupAdmins = [nextAdmin];
      }
    }

    return promotedAdminId;
  }

  async emitAdminTransferredIfNeeded({
    conversation,
    promotedAdminId,
    actorId,
    participantLookup,
  }) {
    if (!promotedAdminId) return;

    const promotedAdmin =
      participantLookup?.get(String(promotedAdminId)) ||
      (await this.reloadConversation(conversation._id))?.participants?.find(
        (item) => String(item?._id || item) === String(promotedAdminId)
      );

    if (!promotedAdmin) return;

    await this.emitSystemMessage({
      conversation,
      text: `${getDisplayName(promotedAdmin)} đã được chuyển quyền trưởng nhóm`,
      action: CHAT_GROUP_ACTIONS.ADMIN_TRANSFERRED,
      actorId,
      targetUserIds: [promotedAdminId],
    });
  }

  async findUserConversations(currentUserId) {
    const conversations =
      await this.conversationRepository.findUserConversations(currentUserId);

    return Array.isArray(conversations) ? conversations : [];
  }

  async createConversation(payload) {
    const {
      type = 'direct',
      participantId,
      participantIds = [],
      groupName = '',
      projectId = null,
      currentUserId,
      groupAvatarFile = null,
    } = payload;

    if (type === 'direct') {
      if (!participantId) {
        throw new AppError('participantId is required', 400);
      }

      const directParticipants = uniqueIds([currentUserId, participantId]);

      if (directParticipants.length !== 2) {
        throw new AppError('Invalid direct conversation participants', 400);
      }

      const existing =
        await this.conversationRepository.findDirectConversationBetweenUsers(
          directParticipants
        );

      if (existing) return existing;

      const created = await this.conversationRepository.create({
        type: 'direct',
        participants: directParticipants,
        createdBy: currentUserId,
        unreadCounts: buildUnreadCounts(directParticipants),
      });

      return this.reloadConversation(created._id);
    }

    const normalizedParticipants = uniqueIds([currentUserId, ...(participantIds || [])]);

    if (normalizedParticipants.length < 2) {
      throw new AppError('A group conversation must have at least 2 participants', 400);
    }

    const groupAvatar = groupAvatarFile ? `/uploads/${groupAvatarFile.filename}` : '';

    const created = await this.conversationRepository.create({
      type: 'group',
      projectId: projectId || null,
      groupName: String(groupName || '').trim(),
      groupAvatar,
      participants: normalizedParticipants,
      groupAdmins: [currentUserId],
      createdBy: currentUserId,
      unreadCounts: buildUnreadCounts(normalizedParticipants),
    });

    return this.reloadConversation(created._id);
  }

  async updateConversation(payload) {
    const {
      id,
      groupName,
      currentUserId,
      groupAvatarFile = null,
    } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    requireGroupConversation(conversation);
    requireGroupAdmin(conversation, currentUserId);

    const previousGroupName = String(conversation.groupName || '').trim();
    const nextGroupName =
      groupName !== undefined
        ? String(groupName || '').trim()
        : previousGroupName;

    const hasGroupNameChanged =
      groupName !== undefined && nextGroupName !== previousGroupName;

    const hasGroupAvatarChanged = Boolean(groupAvatarFile);

    if (!hasGroupNameChanged && !hasGroupAvatarChanged) {
      return this.reloadConversation(conversation._id);
    }

    if (groupName !== undefined) {
      conversation.groupName = nextGroupName;
    }

    if (groupAvatarFile) {
      conversation.groupAvatar = `/uploads/${groupAvatarFile.filename}`;
    }

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    const updatedConversation = await this.reloadConversation(conversation._id);

    if (hasGroupNameChanged) {
      const actor =
        (updatedConversation?.participants || []).find(
          (item) => String(item?._id || item) === String(currentUserId)
        ) || null;

      const actorName = actor ? getDisplayName(actor) : 'Thành viên';
      const safeGroupName = nextGroupName || 'Nhóm chat';

      await this.emitSystemMessage({
        conversation,
        text: `${actorName} đã đổi tên nhóm thành "${safeGroupName}"`,
        action: CHAT_GROUP_ACTIONS.GROUP_NAME_UPDATED,
        actorId: currentUserId,
        targetUserIds: [],
      });
    }

    const latestConversation = await this.reloadConversation(conversation._id);

    await this.publishService.publishConversationUpdated({
      conversation: latestConversation,
      participantIds: normalizeParticipantIds(latestConversation?.participants || []),
    });

    return latestConversation;
  }

  async addMembers(payload) {
    const { id, participantIds = [], currentUserId } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    requireGroupConversation(conversation);
    requireGroupAdmin(conversation, currentUserId);

    const incomingIds = normalizeParticipantIds(participantIds);
    const existingIds = normalizeParticipantIds(conversation.participants || []);
    const actuallyAdded = incomingIds.filter((uid) => !existingIds.includes(String(uid)));

    if (!actuallyAdded.length) {
      return this.reloadConversation(conversation._id);
    }

    const nextParticipantIds = uniqueIds([...existingIds, ...actuallyAdded]);
    conversation.participants = nextParticipantIds;

    const unreadCounts = getConversationUnreadCountsMap(conversation);
    nextParticipantIds.forEach((uid) => {
      unreadCounts.set(String(uid), Number(unreadCounts.get(String(uid)) || 0));
    });
    conversation.unreadCounts = unreadCounts;

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    const updated = await this.reloadConversation(conversation._id);

    const addedUsers = (updated?.participants || []).filter((participant) =>
      actuallyAdded.includes(String(participant?._id || participant))
    );

    const addedNames = addedUsers.map((user) => getDisplayName(user)).join(', ');

    await this.emitSystemMessage({
      conversation,
      text: addedNames
        ? `${addedNames} đã được thêm vào nhóm`
        : 'Thành viên đã được thêm vào nhóm',
      action: CHAT_GROUP_ACTIONS.MEMBER_ADDED,
      actorId: currentUserId,
      targetUserIds: actuallyAdded,
      extraParticipantIds: actuallyAdded,
    });

    return this.reloadConversation(conversation._id);
  }

  async removeMember(payload) {
    const { id, participantIds = [], currentUserId } = payload;
    const targetUserId = String(participantIds?.[0] || '');

    if (!targetUserId) {
      throw new AppError('participantId is required', 400);
    }

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    requireGroupConversation(conversation);
    requireGroupAdmin(conversation, currentUserId);

    const existingIds = normalizeParticipantIds(conversation.participants || []);
    if (!existingIds.includes(targetUserId)) {
      throw new AppError('Participant is not in this conversation', 400);
    }

    if (existingIds.length <= 2) {
      throw new AppError('Cannot remove member from a group with only 2 participants left', 400);
    }

    const populatedBefore = await this.reloadConversation(conversation._id);
    const participantLookup = buildParticipantLookup(populatedBefore?.participants || []);
    const removedUser = participantLookup.get(targetUserId);

    conversation.participants = existingIds.filter((uid) => uid !== targetUserId);
    conversation.groupAdmins = normalizeParticipantIds(conversation.groupAdmins || []).filter(
      (uid) => uid !== targetUserId
    );

    const unreadCounts = getConversationUnreadCountsMap(conversation);
    unreadCounts.delete(targetUserId);
    conversation.unreadCounts = unreadCounts;

    const promotedAdminId = this.transferAdminIfNeeded(conversation);

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    await this.emitSystemMessage({
      conversation,
      text: removedUser
        ? `${getDisplayName(removedUser)} đã bị xóa khỏi nhóm`
        : 'Một thành viên đã bị xóa khỏi nhóm',
      action: CHAT_GROUP_ACTIONS.MEMBER_REMOVED,
      actorId: currentUserId,
      targetUserIds: [targetUserId],
      extraParticipantIds: [targetUserId],
    });

    await this.emitAdminTransferredIfNeeded({
      conversation,
      promotedAdminId,
      actorId: currentUserId,
      participantLookup,
    });

    return this.reloadConversation(conversation._id);
  }

  async leaveConversation(payload) {
    const { id, currentUserId } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    requireGroupConversation(conversation);

    const existingIds = normalizeParticipantIds(conversation.participants || []);
    if (!existingIds.includes(String(currentUserId))) {
      throw new AppError('You are not a participant of this conversation', 403);
    }

    if (existingIds.length <= 2) {
      throw new AppError('Cannot leave a group with only 2 participants left', 400);
    }

    const populatedBefore = await this.reloadConversation(conversation._id);
    const participantLookup = buildParticipantLookup(populatedBefore?.participants || []);
    const leavingUser = participantLookup.get(String(currentUserId));

    conversation.participants = existingIds.filter(
      (uid) => uid !== String(currentUserId)
    );
    conversation.groupAdmins = normalizeParticipantIds(conversation.groupAdmins || []).filter(
      (uid) => uid !== String(currentUserId)
    );

    const unreadCounts = getConversationUnreadCountsMap(conversation);
    unreadCounts.delete(String(currentUserId));
    conversation.unreadCounts = unreadCounts;

    const promotedAdminId = this.transferAdminIfNeeded(conversation);

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    await this.emitSystemMessage({
      conversation,
      text: leavingUser
        ? `${getDisplayName(leavingUser)} đã rời nhóm`
        : 'Một thành viên đã rời nhóm',
      action: CHAT_GROUP_ACTIONS.MEMBER_LEFT,
      actorId: currentUserId,
      targetUserIds: [currentUserId],
      extraParticipantIds: [currentUserId],
    });

    await this.emitAdminTransferredIfNeeded({
      conversation,
      promotedAdminId,
      actorId: currentUserId,
      participantLookup,
    });

    return this.reloadConversation(conversation._id);
  }
}