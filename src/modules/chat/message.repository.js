import Message from './message.model.js';

class MessageRepository {
  async create(payload) {
    return Message.create(payload);
  }

  async findByIdPopulated(messageId) {
    return Message.findById(messageId)
      .populate('senderId', '_id fullName email avatar')
      .lean();
  }

  async findConversationMessages(conversationId, limit = 50) {
    const items = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', '_id fullName email avatar')
      .lean();

    return items.reverse();
  }
}

export default MessageRepository;
