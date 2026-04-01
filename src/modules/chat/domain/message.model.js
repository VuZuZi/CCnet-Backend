import mongoose from 'mongoose';
import {
  CHAT_GROUP_ACTIONS,
  CHAT_GROUP_EVENT_KIND,
  CHAT_MESSAGE_STATUS,
  CHAT_MESSAGE_TYPES,
} from '../chat.constants.js';

const linkSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    thumbnail: { type: String, default: '' },
  },
  { _id: false }
);

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    filename: { type: String, default: '' },
    mimetype: { type: String, default: '' },
    originalName: { type: String, default: '' },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const seenBySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    emoji: {
      type: String,
      required: true,
      trim: true,
    },
    reactedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const systemMetaSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [CHAT_GROUP_EVENT_KIND],
      default: CHAT_GROUP_EVENT_KIND,
    },
    action: {
      type: String,
      enum: Object.values(CHAT_GROUP_ACTIONS),
      default: CHAT_GROUP_ACTIONS.MEMBER_ADDED,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetUserIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    messageType: {
      type: String,
      enum: Object.values(CHAT_MESSAGE_TYPES),
      default: CHAT_MESSAGE_TYPES.USER,
    },
    text: {
      type: String,
      default: '',
      trim: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    links: {
      type: [linkSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    isUnsent: {
      type: Boolean,
      default: false,
    },
    unsentAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(CHAT_MESSAGE_STATUS),
      default: CHAT_MESSAGE_STATUS.SENT,
    },
    seenBy: {
      type: [seenBySchema],
      default: [],
    },
    meta: {
      type: systemMetaSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;