import AppError from "../../../core/AppError.js";
import { normalizeParticipantIds } from "../utils/participant.util.js";
import { saveConversationDocument } from "../utils/conversation.util.js";
import { requireConversationParticipant } from "./helpers/conversation-access.helper.js";
import { CHAT_CLOUDINARY_FOLDERS } from "../chat.upload.constants.js";
import { mapCloudinaryAttachment } from "../mappers/cloudinary-attachment.mapper.js";
import PinnedMessageRepository from "../domain/pinned-message.repository.js";

const MAX_PINNED_MESSAGES_PER_CONVERSATION = 5;

function mapPinnedItem(pinDoc, message) {
  return {
    _id: String(pinDoc?._id || ""),
    conversationId: String(pinDoc?.conversationId || message?.conversationId || ""),
    messageId: String(message?._id || pinDoc?.messageId || ""),
    pinnedAt: pinDoc?.createdAt || new Date(),
    pinnedBy: pinDoc?.pinnedBy || null,
    message: message || null,
  };
}

export default class MessageService {
  constructor({
    conversationRepository,
    messageRepository,
    publishService,
    cloudinaryProvider,
    pinnedMessageRepository,
  }) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.publishService = publishService;
    this.cloudinaryProvider = cloudinaryProvider;
    this.pinnedMessageRepository =
      pinnedMessageRepository || new PinnedMessageRepository();
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

  async getPinnedMessages(payload) {
    const { id, currentUserId } = payload;

    await requireConversationParticipant(
      this.conversationRepository,
      id,
      currentUserId
    );

    const pins = await this.pinnedMessageRepository.findByConversation(id);

    const resolved = await Promise.all(
      pins.map(async (pinDoc) => {
        const message = await this.messageRepository.findByIdPopulated(pinDoc.messageId);
        if (!message || message?.isUnsent) return null;
        return mapPinnedItem(pinDoc, message);
      })
    );

    return resolved.filter(Boolean);
  }

  async uploadAttachments(uploadedFiles = []) {
    const safeFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    if (!safeFiles.length) return [];

    const uploaded = await Promise.all(
      safeFiles.map(async (file) => {
        const result = await this.cloudinaryProvider.uploadImage(
          file.buffer,
          CHAT_CLOUDINARY_FOLDERS.attachments
        );

        return mapCloudinaryAttachment(file, result);
      })
    );

    return uploaded;
  }

  async sendMessage(payload) {
    const {
      conversationId,
      text = "",
      uploadedFiles = [],
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

      if (
        !replyMessage ||
        String(replyMessage.conversationId) !== String(conversationId)
      ) {
        throw new AppError("Reply target is invalid", 400);
      }

      replyToMessageId = replyTo;
    }

    const attachments = await this.uploadAttachments(uploadedFiles);

    const createdMessage = await this.messageRepository.create({
      conversationId,
      senderId: currentUserId,
      text: String(text || "").trim(),
      attachments,
      links: [],
      replyTo: replyToMessageId,
      reactions: [],
      seenBy: [],
      status: "sent",
      messageType: "user",
      isUnsent: false,
    });

    conversation.lastMessage = createdMessage._id;

    await saveConversationDocument(this.conversationRepository, conversation, {
      touchUpdatedAt: true,
    });

    const populatedMessage = await this.messageRepository.findByIdPopulated(
      createdMessage._id
    );

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
      throw new AppError("Message not found", 404);
    }

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      message.conversationId,
      currentUserId
    );

    const existingIndex = (message.reactions || []).findIndex(
      (item) =>
        String(item?.userId || "") === String(currentUserId) &&
        String(item?.emoji || "") === String(emoji || "")
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions = Array.isArray(message.reactions) ? message.reactions : [];
      message.reactions.push({
        userId: currentUserId,
        emoji: String(emoji || "").trim(),
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

  async pinMessage(payload) {
    const { id: conversationId, messageId, currentUserId } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      conversationId,
      currentUserId
    );

    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      throw new AppError("Message not found", 404);
    }

    if (String(message.conversationId || "") !== String(conversationId)) {
      throw new AppError("Message does not belong to this conversation", 400);
    }

    if (message?.isUnsent) {
      throw new AppError("Cannot pin unsent message", 400);
    }

    if (String(message?.messageType || "user") !== "user") {
      throw new AppError("Only user messages can be pinned", 400);
    }

    const existed = await this.pinnedMessageRepository.findByConversationAndMessage(
      conversationId,
      messageId
    );

    if (existed) {
      throw new AppError("Message already pinned", 409);
    }

    const currentCount = await this.pinnedMessageRepository.countByConversation(
      conversationId
    );

    if (currentCount >= MAX_PINNED_MESSAGES_PER_CONVERSATION) {
      throw new AppError(
        `Only ${MAX_PINNED_MESSAGES_PER_CONVERSATION} pinned messages are allowed`,
        400
      );
    }

    const createdPin = await this.pinnedMessageRepository.create({
      conversationId,
      messageId,
      pinnedBy: currentUserId,
    });

    const freshPin = await this.pinnedMessageRepository.findByConversationAndMessage(
      conversationId,
      messageId
    );

    const populatedMessage = await this.messageRepository.findByIdPopulated(
      createdPin.messageId
    );

    const mapped = mapPinnedItem(freshPin || createdPin, populatedMessage);

    await this.publishService.publishPinnedMessage({
      conversationId,
      pin: mapped,
      participantIds: normalizeParticipantIds(conversation.participants || []),
    });

    return mapped;
  }

  async unpinMessage(payload) {
    const { id: conversationId, messageId, currentUserId } = payload;

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      conversationId,
      currentUserId
    );

    const deleted = await this.pinnedMessageRepository.deleteByConversationAndMessage(
      conversationId,
      messageId
    );

    if (!deleted) {
      throw new AppError("Pinned message not found", 404);
    }

    await this.publishService.publishUnpinnedMessage({
      conversationId,
      messageId,
      participantIds: normalizeParticipantIds(conversation.participants || []),
    });

    return {
      conversationId: String(conversationId),
      messageId: String(messageId),
    };
  }

  async unsendMessage(payload) {
    const { id, currentUserId } = payload;

    const message = await this.messageRepository.findById(id);
    if (!message) {
      throw new AppError("Message not found", 404);
    }

    if (String(message.senderId || "") !== String(currentUserId)) {
      throw new AppError("You can only unsend your own message", 403);
    }

    const conversation = await requireConversationParticipant(
      this.conversationRepository,
      message.conversationId,
      currentUserId
    );

    message.text = "";
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

    const removedPin = await this.pinnedMessageRepository.deleteByConversationAndMessage(
      message.conversationId,
      message._id
    );

    if (removedPin) {
      await this.publishService.publishUnpinnedMessage({
        conversationId: message.conversationId,
        messageId: message._id,
        participantIds: normalizeParticipantIds(conversation.participants || []),
      });
    }

    return updatedMessage;
  }
}