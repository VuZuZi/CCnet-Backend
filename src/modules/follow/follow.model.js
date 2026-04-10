import mongoose from "mongoose";

const followSchema = new mongoose.Schema(
  {
    followerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    followingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
  },
  { timestamps: true },
);

followSchema.index(
  { followerId: 1, followingId: 1 },
  {
    unique: true,
    partialFilterExpression: { followingId: { $type: "objectId" } },
  },
);

followSchema.index(
  { followerId: 1, projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { projectId: { $type: "objectId" } },
  },
);

const Follow = mongoose.models.Follow || mongoose.model("Follow", followSchema);

export default Follow;
