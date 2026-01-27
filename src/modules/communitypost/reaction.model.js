import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
  {
    targetId: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: true, 
      refPath: 'targetType', 
      index: true 
    },
    targetType: { 
      type: String, 
      enum: ['Post', 'Comment'], 
      default: 'Post',
      required: true
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['like', 'dislike'], 
      required: true 
    }
  },
  { timestamps: true }
);


reactionSchema.index({ targetId: 1, userId: 1, targetType: 1 }, { unique: true });

export default mongoose.model("Reaction", reactionSchema);