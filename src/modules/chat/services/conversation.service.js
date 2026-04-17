import AppError from "../../../core/AppError.js";
import { uniqueIds } from "../utils/id.util.js";
import {
  normalizeParticipantIds,
  pickRandomAdminCandidate,
} from "../utils/participant.util.js";
import { getDisplayName } from "../utils/user.util.js";
import {
  buildUnreadCounts,
  getConversationUnreadCountsMap,
  saveConversationDocument,
} from "../utils/conversation.util.js";
import ChatGroupEventService from "./group-event.service.js";
import { CHAT_GROUP_ACTIONS } from "../chat.constants.js";
import {
  requireConversationParticipant,
  requireGroupAdmin,
  requireGroupConversation,
} from "./helpers/conversation-access.helper.js";
import { CHAT_CLOUDINARY_FOLDERS } from "../chat.upload.constants.js";

function buildParticipantLookup(participants = []) {
  const map = new Map();

  (Array.isArray(participants) ? participants : []).forEach((item) => {
    const id = String(item?._id || item?.id || item || "");
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
    cloudinaryProvider,
  }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.publishService = publishService;
    this.cloudinaryProvider = cloudinaryProvider;

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

  async publishConversationUpdate(conversation, extraParticipantIds = []) {
    if (!conversation) return null;

    const safeConversation =
      conversation?._id || conversation?.id
        ? conversation
        : await this.reloadConversation(conversation);

    if (!safeConversation) return null;

    const participantIds = normalizeParticipantIds([
      ...(safeConversation?.participants || []),
      ...extraParticipantIds,
    ]);

    await this.publishService.publishConversationUpdated({
      conversation: safeConversation,
      participantIds,
    });

    return safeConversation;
  }

  async uploadGroupAvatar(groupAvatarFile) {
    if (!groupAvatarFile) return "";

    const result = await this.cloudinaryProvider.uploadImage(
      groupAvatarFile.buffer,
      CHAT_CLOUDINARY_FOLDERS.groupAvatars
    );

    return result?.secure_url || result?.url || "";
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
      type = "direct",
      participantId,
      participantIds = [],
      groupName = "",
      projectId = null,
      currentUserId,
      groupAvatarFile = null,
    } = payload;

    if (type === "direct") {
      if (!participantId) {
        throw new AppError("participantId is required", 400);
      }

      const directParticipants = uniqueIds([currentUserId, participantId]);

      if (directParticipants.length !== 2) {
        throw new AppError("Invalid direct conversation participants", 400);
      }

      const existing =
        await this.conversationRepository.findDirectConversationBetweenUsers(
          directParticipants
        );

      if (existing) return existing;

      const created = await this.conversationRepository.create({
        type: "direct",
        participants: directParticipants,
        createdBy: currentUserId,
        unreadCounts: buildUnreadCounts(directParticipants),
      });

      return this.reloadConversation(created._id);
    }

    const normalizedParticipants = uniqueIds([currentUserId, ...(participantIds || [])]);

    if (normalizedParticipants.length < 1) {
      throw new AppError("A group conversation must have at least 1 participant", 400);
    }

    const groupAvatar = await this.uploadGroupAvatar(groupAvatarFile);

    const created = await this.conversationRepository.create({
      type: "group",
      projectId: projectId || null,
      groupName: String(groupName || "").trim(),
      groupAvatar,
      participants: normalizedParticipants,
      groupAdmins: [currentUserId],
      createdBy: currentUserId,
      unreadCounts: buildUnreadCounts(normalizedParticipants),
    });

    return this.reloadConversation(created._id);
  }

  async ensureProjectGroupConversation({
    projectId,
    organizerId,
    participantIds = [],
    groupName = "",
  }) {
    if (!projectId) {
      throw new AppError("projectId is required", 400);
    }

    if (!organizerId) {
      throw new AppError("organizerId is required", 400);
    }

    const normalizedParticipants = uniqueIds([organizerId, ...(participantIds || [])]);

    if (normalizedParticipants.length < 1) {
      throw new AppError("A project group conversation must have at least 1 participant", 400);
    }

    const existing =
      await this.conversationRepository.findGroupConversationByProjectId(projectId);

    if (!existing) {
      const created = await this.conversationRepository.create({
        type: "group",
        projectId,
        groupName: String(groupName || "").trim(),
        groupAvatar: "",
        participants: normalizedParticipants,
        groupAdmins: [organizerId],
        createdBy: organizerId,
        unreadCounts: buildUnreadCounts(normalizedParticipants),
      });

      return this.reloadConversation(created._id);
    }

    const conversation = await this.conversationRepository.findById(existing._id);
    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    const currentParticipants = normalizeParticipantIds(conversation.participants || []);
    const mergedParticipants = uniqueIds([...currentParticipants, ...normalizedParticipants]);

    const currentAdmins = normalizeParticipantIds(conversation.groupAdmins || []);
    const mergedAdmins = uniqueIds(
      currentAdmins.length > 0 ? currentAdmins : [organizerId]
    );

    let shouldSave = false;

    if (mergedParticipants.length !== currentParticipants.length) {
      conversation.participants = mergedParticipants;
      shouldSave = true;
    }

    if (!mergedAdmins.includes(String(organizerId))) {
      conversation.groupAdmins = uniqueIds([...mergedAdmins, organizerId]);
      shouldSave = true;
    } else if (currentAdmins.length === 0) {
      conversation.groupAdmins = uniqueIds([...mergedAdmins]);
      shouldSave = true;
    }

    const safeGroupName = String(groupName || "").trim();
    if (safeGroupName && safeGroupName !== String(conversation.groupName || "").trim()) {
      conversation.groupName = safeGroupName;
      shouldSave = true;
    }

    const unreadCounts = getConversationUnreadCountsMap(conversation);
    mergedParticipants.forEach((uid) => {
      unreadCounts.set(String(uid), Number(unreadCounts.get(String(uid)) || 0));
    });
    conversation.unreadCounts = unreadCounts;

    if (shouldSave) {
      await saveConversationDocument(this.conversationRepository, conversation, {
        touchUpdatedAt: true,
      });
    }

    return this.reloadConversation(conversation._id);
  }

  async getProjectConversationDocument(projectId) {
    if (!projectId) return null;

    const existing =
      await this.conversationRepository.findGroupConversationByProjectId(projectId);

    if (!existing?._id) return null;

    return this.conversationRepository.findById(existing._id);
  }

  async syncApprovedVolunteerToProjectConversation({
    projectId,
    organizerId,
    volunteerId,
    groupName = "",
    actorId = null,
  }) {
    if (!projectId) {
      throw new AppError("projectId is required", 400);
    }

    if (!organizerId) {
      throw new AppError("organizerId is required", 400);
    }

    if (!volunteerId) {
      throw new AppError("volunteerId is required", 400);
    }

    const existing =
      await this.conversationRepository.findGroupConversationByProjectId(projectId);

    if (!existing) {
      const createdConversation = await this.ensureProjectGroupConversation({
        projectId,
        organizerId,
        participantIds: [volunteerId],
        groupName,
      });

      const createdConversationId =
        createdConversation?._id || createdConversation?.id || null;

      if (!createdConversationId) {
        return createdConversation;
      }

      const rawConversation = await this.conversationRepository.findById(createdConversationId);
      if (!rawConversation) {
        const fallbackConversation = await this.reloadConversation(createdConversationId);
        await this.publishConversationUpdate(fallbackConversation, [String(volunteerId)]);
        return fallbackConversation;
      }

      const populatedConversation = await this.reloadConversation(createdConversationId);

      const addedUser = (populatedConversation?.participants || []).find(
        (participant) =>
          String(participant?._id || participant) === String(volunteerId)
      );

      await this.emitSystemMessage({
        conversation: rawConversation,
        text: addedUser
          ? `${getDisplayName(addedUser)} đã được thêm vào nhóm`
          : "Thành viên đã được thêm vào nhóm",
        action: CHAT_GROUP_ACTIONS.MEMBER_ADDED,
        actorId: actorId || organizerId,
        targetUserIds: [String(volunteerId)],
        extraParticipantIds: [String(volunteerId)],
      });

      const latestConversation = await this.reloadConversation(createdConversationId);
      await this.publishConversationUpdate(latestConversation, [String(volunteerId)]);
      return latestConversation;
    }

    return this.addMemberToProjectConversation({
      projectId,
      participantId: volunteerId,
      actorId: actorId || organizerId,
    });
  }

  async addMemberToProjectConversation({
    projectId,
    participantId,
    actorId = null,
  }) {
    if (!projectId || !participantId) {
      throw new AppError("projectId and participantId are required", 400);
    }

    const existing =
      await this.conversationRepository.findGroupConversationByProjectId(projectId);

    if (!existing) return null;

    const conversation = await this.conversationRepository.findById(existing._id);
    if (!conversation) return null;

    const existingIds = normalizeParticipantIds(conversation.participants || []);
    const targetId = String(participantId);

    if (existingIds.includes(targetId)) {
      const latestConversation = await this.reloadConversation(conversation._id);
      await this.publishConversationUpdate(latestConversation, [targetId]);
      return latestConversation;
    }

    const nextParticipantIds = uniqueIds([...existingIds, targetId]);
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

    const addedUser = (updated?.participants || []).find(
      (participant) => String(participant?._id || participant) === targetId
    );

    await this.emitSystemMessage({
      conversation,
      text: addedUser
        ? `${getDisplayName(addedUser)} đã được thêm vào nhóm`
        : "Thành viên đã được thêm vào nhóm",
      action: CHAT_GROUP_ACTIONS.MEMBER_ADDED,
      actorId: actorId || conversation.createdBy || null,
      targetUserIds: [targetId],
      extraParticipantIds: [targetId],
    });

    const latestConversation = await this.reloadConversation(conversation._id);
    await this.publishConversationUpdate(latestConversation, [targetId]);
    return latestConversation;
  }

  async removeMemberFromProjectConversation({
    projectId,
    participantId,
    actorId = null,
  }) {
    if (!projectId || !participantId) {
      throw new AppError("projectId and participantId are required", 400);
    }

    const conversation = await this.getProjectConversationDocument(projectId);
    if (!conversation) return null;

    const targetUserId = String(participantId);
    const existingIds = normalizeParticipantIds(conversation.participants || []);

    if (!existingIds.includes(targetUserId)) {
      const latestConversation = await this.reloadConversation(conversation._id);
      await this.publishConversationUpdate(latestConversation, [targetUserId]);
      return latestConversation;
    }

    if (existingIds.length <= 1) {
      throw new AppError(
        "Cannot remove member from a group with only 1 participant left",
        400
      );
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
        : "Một thành viên đã bị xóa khỏi nhóm",
      action: CHAT_GROUP_ACTIONS.MEMBER_REMOVED,
      actorId: actorId || conversation.createdBy || null,
      targetUserIds: [targetUserId],
      extraParticipantIds: [targetUserId],
    });

    await this.emitAdminTransferredIfNeeded({
      conversation,
      promotedAdminId,
      actorId: actorId || conversation.createdBy || null,
      participantLookup,
    });

    const latestConversation = await this.reloadConversation(conversation._id);
    await this.publishConversationUpdate(latestConversation, [targetUserId]);
    return latestConversation;
  }

  async updateConversation(payload) {
    const { id, groupName, currentUserId, groupAvatarFile = null } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    requireGroupConversation(conversation);
    requireGroupAdmin(conversation, currentUserId);

    const previousGroupName = String(conversation.groupName || "").trim();
    const nextGroupName =
      groupName !== undefined ? String(groupName || "").trim() : previousGroupName;

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
      conversation.groupAvatar = await this.uploadGroupAvatar(groupAvatarFile);
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

      const actorName = actor ? getDisplayName(actor) : "Thành viên";
      const safeGroupName = nextGroupName || "Nhóm chat";

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
      const latestConversation = await this.reloadConversation(conversation._id);
      await this.publishConversationUpdate(latestConversation, incomingIds);
      return latestConversation;
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

    const addedNames = addedUsers.map((user) => getDisplayName(user)).join(", ");

    await this.emitSystemMessage({
      conversation,
      text: addedNames
        ? `${addedNames} đã được thêm vào nhóm`
        : "Thành viên đã được thêm vào nhóm",
      action: CHAT_GROUP_ACTIONS.MEMBER_ADDED,
      actorId: currentUserId,
      targetUserIds: actuallyAdded,
      extraParticipantIds: actuallyAdded,
    });

    const latestConversation = await this.reloadConversation(conversation._id);
    await this.publishConversationUpdate(latestConversation, actuallyAdded);
    return latestConversation;
  }

  async removeMember(payload) {
    const { id, participantIds = [], currentUserId } = payload;
    const targetUserId = String(participantIds?.[0] || "");

    if (!targetUserId) {
      throw new AppError("participantId is required", 400);
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
      throw new AppError("Participant is not in this conversation", 400);
    }

    if (existingIds.length <= 1) {
      throw new AppError(
        "Cannot remove member from a group with only 1 participant left",
        400
      );
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
        : "Một thành viên đã bị xóa khỏi nhóm",
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

    const latestConversation = await this.reloadConversation(conversation._id);
    await this.publishConversationUpdate(latestConversation, [targetUserId]);
    return latestConversation;
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
      throw new AppError("You are not a participant of this conversation", 403);
    }

    if (existingIds.length <= 1) {
      throw new AppError("Cannot leave a group when you are the last participant", 400);
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
        : "Một thành viên đã rời nhóm",
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

    const latestConversation = await this.reloadConversation(conversation._id);
    await this.publishConversationUpdate(latestConversation, [String(currentUserId)]);
    return latestConversation;
  }
}