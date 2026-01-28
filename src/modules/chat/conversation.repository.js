import mongoose from 'mongoose';
import AppError from '../../core/AppError.js';
import Conversation from './conversation.model.js';

class ConversationRepository {
  async findDirectConversation(userId, participantId) {
    const uid = new mongoose.Types.ObjectId(userId);
    const pid = new mongoose.Types.ObjectId(participantId);

    return Conversation.findOne({
      participants: { $all: [uid, pid] },
      $expr: { $eq: [{ $size: '$participants' }, 2] },
      isGroup: false
    });
  }

  async createDirectConversation(userId, participantId) {
    const uid = new mongoose.Types.ObjectId(userId);
    const pid = new mongoose.Types.ObjectId(participantId);

    return Conversation.create({
      participants: [uid, pid],
      isGroup: false,
      unreadCounts: { [uid.toString()]: 0, [pid.toString()]: 0 }
    });
  }

  async findById(conversationId) {
    try {
      return await Conversation.findById(conversationId);
    } catch (err) {
      if (err.name === 'CastError') throw new AppError('Invalid conversationId format', 400);
      throw err;
    }
  }

  async findUserConversations(userId) {
    const uid = new mongoose.Types.ObjectId(userId);

    return Conversation.find({ participants: uid })
      .sort({ updatedAt: -1 })
      .populate({ path: 'participants', select: '_id fullName email avatar' })
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: '_id fullName email avatar' }
      })
      .lean();
  }

  async save(conversation) {
    conversation.updatedAt = new Date();
    return conversation.save();
  }

  async setUnreadCount(conversationId, userKey, count = 0) {
    try {
      return await Conversation.updateOne(
        { _id: new mongoose.Types.ObjectId(conversationId) },
        {
          $set: {
            [`unreadCounts.${userKey}`]: count,
            updatedAt: new Date()
          }
        }
      );
    } catch (err) {
      if (err.name === 'CastError') throw new AppError('Invalid conversationId format', 400);
      throw err;
    }
  }
}

export default ConversationRepository;
