import Message from './message.model.js';

class MessageRepository {
  buildPopulateQuery(query) {
    return query
      .populate('senderId', '_id fullName email avatar')
      .populate('seenBy.userId', '_id fullName email avatar')
      .populate('reactions.userId', '_id fullName email avatar')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: '_id fullName email avatar',
        },
        select: '_id text attachments senderId isUnsent',
      });
  }

  async create(payload) {
    return Message.create(payload);
  }

  async findById(messageId) {
    return Message.findById(messageId);
  }

  async findByIdLean(messageId) {
    return Message.findById(messageId).lean();
  }

  async findByIdPopulated(messageId) {
    return this.buildPopulateQuery(Message.findById(messageId)).lean();
  }

  async findConversationMessages(conversationId, limit = 200) {
    const items = await this.buildPopulateQuery(
      Message.find({ conversationId }).sort({ createdAt: -1 }).limit(limit)
    ).lean();

    return items.reverse();
  }

  async findConversationAssetMessagesPage(
    conversationId,
    { type, page = 1, limit = 30 } = {}
  ) {
    const safePage = Math.max(1, Number(page || 1));
    const safeLimit = Math.min(100, Math.max(1, Number(limit || 30)));
    const skip = (safePage - 1) * safeLimit;

    const filters = { conversationId };

    if (type === 'link') {
      filters['links.0'] = { $exists: true };
    } else if (type === 'image') {
      filters.attachments = {
        $elemMatch: {
          mimetype: { $regex: '^image/', $options: 'i' },
        },
      };
    } else if (type === 'file') {
      filters.attachments = {
        $elemMatch: {
          mimetype: { $not: /^image\//i },
        },
      };
    } else {
      return {
        items: [],
        page: safePage,
        limit: safeLimit,
        hasMore: false,
        nextPage: null,
      };
    }

    const rows = await Message.find(filters)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(safeLimit + 1)
      .select('_id attachments links createdAt')
      .lean();

    const hasMore = rows.length > safeLimit;
    const items = hasMore ? rows.slice(0, safeLimit) : rows;

    return {
      items,
      page: safePage,
      limit: safeLimit,
      hasMore,
      nextPage: hasMore ? safePage + 1 : null,
    };
  }

  async findUnreadMessageIdsForUser({
    conversationId,
    currentUserId,
    limit = 200,
  }) {
    const items = await Message.find({
      conversationId,
      senderId: { $ne: currentUserId },
      isUnsent: false,
      messageType: { $ne: 'system' },
      'seenBy.userId': { $ne: currentUserId },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id createdAt')
      .lean();

    return Array.isArray(items) ? items : [];
  }

  async markMessagesAsSeen({ messageIds = [], currentUserId, seenAt = new Date() }) {
    const ids = Array.isArray(messageIds) ? messageIds.filter(Boolean) : [];
    if (!ids.length) return { modifiedCount: 0 };

    return Message.updateMany(
      {
        _id: { $in: ids },
        'seenBy.userId': { $ne: currentUserId },
      },
      {
        $push: {
          seenBy: {
            userId: currentUserId,
            seenAt,
          },
        },
        $set: {
          status: 'seen',
        },
      }
    );
  }

  async save(document) {
    return document.save();
  }
}

export default MessageRepository;