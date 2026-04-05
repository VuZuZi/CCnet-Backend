import mongoose from 'mongoose';
import AppError from '../../../core/AppError.js';
import Conversation from './conversation.model.js';

const conversationPopulate = [
  { path: 'participants', select: '_id fullName email avatar' },
  { path: 'groupAdmins', select: '_id fullName email avatar' },
  { path: 'createdBy', select: '_id fullName email avatar' },
  {
    path: 'lastMessage',
    populate: [
      { path: 'senderId', select: '_id fullName email avatar' },
      { path: 'seenBy.userId', select: '_id fullName email avatar' },
      { path: 'reactions.userId', select: '_id fullName email avatar' },
      {
        path: 'replyTo',
        select: '_id text attachments senderId isUnsent',
        populate: { path: 'senderId', select: '_id fullName email avatar' },
      },
    ],
  },
];

class ConversationRepository {
  buildPopulatedQuery(query) {
    return query.populate(conversationPopulate);
  }

  async findById(id) {
    return Conversation.findById(id);
  }

  async findByIdPopulated(id) {
    return this.buildPopulatedQuery(Conversation.findById(id)).lean();
  }

  async findUserConversations(currentUserId) {
    return this.buildPopulatedQuery(
      Conversation.find({
        participants: new mongoose.Types.ObjectId(currentUserId),
      }).sort({ updatedAt: -1 })
    ).lean();
  }

  async findDirectConversationBetweenUsers(participantIds = []) {
    const ids = Array.from(
      new Set((participantIds || []).map((id) => String(id)).filter(Boolean))
    );

    if (ids.length !== 2) return null;

    try {
      const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

      return await this.buildPopulatedQuery(
        Conversation.findOne({
          type: 'direct',
          participants: { $all: objectIds },
          $expr: { $eq: [{ $size: '$participants' }, 2] },
        })
      ).lean();
    } catch (err) {
      if (err.name === 'CastError' || err instanceof mongoose.Error.CastError) {
        throw new AppError('Invalid participantIds format', 400);
      }
      throw err;
    }
  }

  async create(payload) {
    return Conversation.create(payload);
  }

  async save(document) {
    return document.save();
  }
}

export default ConversationRepository;