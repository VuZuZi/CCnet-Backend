import path from 'path';
import { validateRequest } from './utils/validate.util.js';
import {
  createConversationSchema,
  getAssetsSchema,
  getMessagesSchema,
  sendMessageSchema,
  reactMessageSchema,
  unsendMessageSchema,
  markAsReadSchema,
  downloadFileSchema,
  updateConversationSchema,
  manageMembersSchema,
  leaveConversationSchema,
} from './chat.validation.js';
import { CHAT_RESPONSE_MESSAGES } from './chat.messages.js';
import {
  mapCreateConversationRequest,
  mapUpdateConversationRequest,
  mapAddMembersRequest,
  mapRemoveMemberRequest,
  mapLeaveConversationRequest,
  mapGetAssetsRequest,
  mapGetMessagesRequest,
  extractUploadedMessageFiles,
  mapSendMessageValidationRequest,
  mapSendMessageServicePayload,
  mapReactMessageRequest,
  mapUnsendMessageRequest,
  mapMarkAsReadRequest,
  mapDownloadFileRequest,
} from './mappers/request.mapper.js';
import { mapUploadedAttachments } from './mappers/attachment.mapper.js';


function ok(res, data, message) {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
}

function created(res, data, message) {
  return res.status(201).json({
    success: true,
    message,
    data,
  });
}

export default class ChatController {
  constructor({
    conversationService,
    messageService,
    readService,
    fileService,
  }) {
    this.conversationService = conversationService;
    this.messageService = messageService;
    this.readService = readService;
    this.fileService = fileService;
  }

  getCurrentUserId(req) {
    return String(req.user?.userId || '');
  }

  withCurrentUser(req, payload = {}) {
    return {
      ...payload,
      currentUserId: this.getCurrentUserId(req),
    };
  }

  getReader(req) {
    const userId = this.getCurrentUserId(req);

    return {
      _id: userId,
      id: userId,
      userId,
      fullName: req.user?.fullName || req.user?.name || '',
      avatar: req.user?.avatar || '',
      email: req.user?.email || '',
    };
  }

  async getConversations(req, res, next) {
    try {
      const data = await this.conversationService.findUserConversations(
        this.getCurrentUserId(req)
      );

      return ok(res, data);
    } catch (error) {
      next(error);
    }
  }

  async createConversation(req, res, next) {
    try {
      const mapped = mapCreateConversationRequest(req);
      const validated = validateRequest(createConversationSchema, mapped);

      const payload = this.withCurrentUser(req, {
        ...validated,
        groupAvatarFile: req.file || null,
      });

      const data = await this.conversationService.createConversation(payload);
      return created(res, data, CHAT_RESPONSE_MESSAGES.CONVERSATION_CREATED);
    } catch (error) {
      next(error);
    }
  }

  async updateConversation(req, res, next) {
    try {
      const mapped = mapUpdateConversationRequest(req);
      const validated = validateRequest(updateConversationSchema, mapped);

      const payload = this.withCurrentUser(req, {
        ...validated,
        groupAvatarFile: req.file || null,
      });

      const data = await this.conversationService.updateConversation(payload);
      return ok(res, data, CHAT_RESPONSE_MESSAGES.CONVERSATION_UPDATED);
    } catch (error) {
      next(error);
    }
  }

  async addMembers(req, res, next) {
    try {
      const mapped = mapAddMembersRequest(req);
      const validated = validateRequest(manageMembersSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.conversationService.addMembers(payload);
      return ok(res, data, CHAT_RESPONSE_MESSAGES.MEMBERS_ADDED);
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req, res, next) {
    try {
      const mapped = mapRemoveMemberRequest(req);
      const validated = validateRequest(manageMembersSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.conversationService.removeMember(payload);
      return ok(res, data, CHAT_RESPONSE_MESSAGES.MEMBER_REMOVED);
    } catch (error) {
      next(error);
    }
  }

  async leaveConversation(req, res, next) {
    try {
      const mapped = mapLeaveConversationRequest(req);
      const validated = validateRequest(leaveConversationSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.conversationService.leaveConversation(payload);
      return ok(res, data, CHAT_RESPONSE_MESSAGES.LEFT_CONVERSATION);
    } catch (error) {
      next(error);
    }
  }

  async getAssets(req, res, next) {
    try {
      const mapped = mapGetAssetsRequest(req);
      const validated = validateRequest(getAssetsSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.messageService.getAssets(payload);
      return ok(res, data);
    } catch (error) {
      next(error);
    }
  }

  async getMessages(req, res, next) {
    try {
      const mapped = mapGetMessagesRequest(req);
      const validated = validateRequest(getMessagesSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.messageService.getMessages(payload);
      return ok(res, data);
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req, res, next) {
    try {
      const uploadedFiles = extractUploadedMessageFiles(req);
      const validationInput = mapSendMessageValidationRequest(req, uploadedFiles);
      const validated = validateRequest(sendMessageSchema, validationInput);

      const attachments = mapUploadedAttachments(uploadedFiles);
      const payload = mapSendMessageServicePayload(
        validated,
        attachments,
        this.getCurrentUserId(req)
      );

      const data = await this.messageService.sendMessage(payload);
      return created(res, data, CHAT_RESPONSE_MESSAGES.MESSAGE_SENT);
    } catch (error) {
      next(error);
    }
  }

  async reactMessage(req, res, next) {
    try {
      const mapped = mapReactMessageRequest(req);
      const validated = validateRequest(reactMessageSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.messageService.reactMessage(payload);
      return ok(res, data, CHAT_RESPONSE_MESSAGES.REACTED_TO_MESSAGE);
    } catch (error) {
      next(error);
    }
  }

  async unsendMessage(req, res, next) {
    try {
      const mapped = mapUnsendMessageRequest(req);
      const validated = validateRequest(unsendMessageSchema, mapped);

      const payload = this.withCurrentUser(req, validated);

      const data = await this.messageService.unsendMessage(payload);
      return ok(res, data, CHAT_RESPONSE_MESSAGES.MESSAGE_UNSENT);
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
  try {
    const mapped = mapMarkAsReadRequest(req);
    const validated = validateRequest(markAsReadSchema, mapped);

    const data = await this.readService.markAsRead({
      conversationId: validated.id,
      currentUserId: this.getCurrentUserId(req),
      reader: this.getReader(req),
    });

    return ok(res, data, CHAT_RESPONSE_MESSAGES.MARKED_AS_READ);
  } catch (error) {
    next(error);
  }
}

  async downloadFile(req, res, next) {
    try {
      const mapped = mapDownloadFileRequest(req);
      const validated = validateRequest(downloadFileSchema, mapped);

      const filePath = this.fileService.getDownloadPath(validated.filename);

      return res.download(filePath, path.basename(filePath), (err) => {
        if (err && !res.headersSent) {
          next(err);
        }
      });
    } catch (error) {
      next(error);
    }
  }
}