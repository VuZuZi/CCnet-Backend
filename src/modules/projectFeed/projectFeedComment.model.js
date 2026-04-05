import mongoose from "mongoose";

const projectFeedCommentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectFeedPost",
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: { type: String, required: true, maxlength: 2000 },
    likedBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    likesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

projectFeedCommentSchema.index({ postId: 1, createdAt: -1 });

export default mongoose.model("ProjectFeedComment", projectFeedCommentSchema);

