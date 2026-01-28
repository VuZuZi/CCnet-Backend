import path from 'path';
import ApiResponse from '../../core/Response.js';
import AppError from '../../core/AppError.js';

import {
  createConversationSchema,
  getMessagesSchema,
  sendMessageSchema,
  markAsReadSchema,
  downloadFileSchema,
} from './chat.validation.js';

class ChatController {
  constructor({ chatService }) {
    this.chatService = chatService;
  }

  getConversations = async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const data = await this.chatService.getUserConversations(userId);
      return ApiResponse.success(res, data, 'Fetched conversations successfully');
    } catch (error) {
      next(error);
    }
  };

  createConversation = async (req, res, next) => {
    try {
      const { error, value } = createConversationSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const convo = await this.chatService.createOrGetConversation(userId, value.participantId);
      return ApiResponse.success(res, convo, 'Conversation ready');
    } catch (error) {
      next(error);
    }
  };

  getMessages = async (req, res, next) => {
    try {
      const { error, value } = getMessagesSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const data = await this.chatService.getConversationMessages(value.id, userId, 50);
      return ApiResponse.success(res, data, 'Fetched messages successfully');
    } catch (error) {
      next(error);
    }
  };

  sendMessage = async (req, res, next) => {
    try {
      const { error, value } = sendMessageSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const files = req.files || [];
      const attachments = files.map((file) => ({
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        filename: file.filename,
      }));

      const hostBaseUrl = `${req.protocol}://${req.get('host')}`;

      const message = await this.chatService.sendMessage(
        value.conversationId,
        userId,
        value.text,
        attachments,
        hostBaseUrl
      );

      return ApiResponse.success(res, message, 'Message sent successfully');
    } catch (error) {
      next(error);
    }
  };

  markAsRead = async (req, res, next) => {
    try {
      const { error, value } = markAsReadSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);

      const userId = req.user?.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const data = await this.chatService.markAsRead(value.id, userId);
      return ApiResponse.success(res, data, 'Conversation marked as read');
    } catch (error) {
      next(error);
    }
  };

  downloadFile = async (req, res, next) => {
    try {
      const { error, value } = downloadFileSchema.validate(req.params);
      if (error) throw new AppError(error.details[0].message, 400);
      const safeName = path.basename(value.filename);
      const filePath = path.resolve(process.cwd(), 'uploads', safeName);

      return res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  };
}

export default ChatController;
