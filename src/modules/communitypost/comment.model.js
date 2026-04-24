import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null
    },
    likesCount: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

commentSchema.index({ postId: 1, isDeleted: 1, createdAt: -1 });

commentSchema.index({ parentCommentId: 1, isDeleted: 1, createdAt: -1 });

export default mongoose.model("Comment", commentSchema);
