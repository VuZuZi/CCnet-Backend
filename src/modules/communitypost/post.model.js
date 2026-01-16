import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    images: [{ type: String }],
    links: [{ type: String }],
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1 });

postSchema.pre("save", function (next) {
  const toObjectId = (id) => {
    if (mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return id;
  };

  if (this.likes) {
    this.likes = [...new Set(this.likes.map(toObjectId))];
  }
  if (this.dislikes) {
    this.dislikes = [...new Set(this.dislikes.map(toObjectId))];
  }

  next();
});

export default mongoose.model("Post", postSchema);
