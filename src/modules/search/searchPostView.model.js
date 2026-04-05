import mongoose from "mongoose";

const searchPostViewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "search_post_views",
  }
);

searchPostViewSchema.index({ userId: 1, postId: 1 }, { unique: true });
searchPostViewSchema.index({ userId: 1, viewedAt: -1 });
searchPostViewSchema.index({ postId: 1, viewedAt: -1 });

const SearchPostView =
  mongoose.models.SearchPostView ||
  mongoose.model("SearchPostView", searchPostViewSchema);

export default SearchPostView;