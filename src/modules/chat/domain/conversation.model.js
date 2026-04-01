import mongoose from 'mongoose';
import { CHAT_CONVERSATION_TYPES } from '../chat.constants.js';

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(CHAT_CONVERSATION_TYPES),
      default: CHAT_CONVERSATION_TYPES.DIRECT,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    groupName: {
      type: String,
      default: '',
      trim: true,
    },
    groupAvatar: {
      type: String,
      default: '',
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    groupAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: [],
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index({ type: 1, updatedAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;