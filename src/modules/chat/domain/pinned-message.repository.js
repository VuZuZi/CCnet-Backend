import PinnedMessageModel from './pinned-message.model.js';

export default class PinnedMessageRepository {
  async findByConversation(conversationId) {
    return PinnedMessageModel.find({ conversationId })
      .sort({ createdAt: -1 })
      .populate('pinnedBy', 'fullName name avatar email')
      .lean();
  }

  async findByConversationAndMessage(conversationId, messageId) {
    return PinnedMessageModel.findOne({ conversationId, messageId })
      .populate('pinnedBy', 'fullName name avatar email')
      .lean();
  }

  async countByConversation(conversationId) {
    return PinnedMessageModel.countDocuments({ conversationId });
  }

  async create(payload) {
    return PinnedMessageModel.create(payload);
  }

  async deleteByConversationAndMessage(conversationId, messageId) {
    return PinnedMessageModel.findOneAndDelete({ conversationId, messageId }).lean();
  }

  async deleteManyByMessageId(messageId) {
    return PinnedMessageModel.deleteMany({ messageId });
  }
}