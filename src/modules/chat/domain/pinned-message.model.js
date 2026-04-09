import mongoose from 'mongoose';

const pinnedMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

pinnedMessageSchema.index(
  { conversationId: 1, messageId: 1 },
  { unique: true }
);

export default mongoose.models.PinnedMessage ||
  mongoose.model('PinnedMessage', pinnedMessageSchema);