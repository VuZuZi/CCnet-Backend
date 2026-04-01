import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
    {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        mediaType: { type: String, enum: ["image", "video"], default: "image" },
    },
    { _id: false },
);

const projectFeedPostSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true,
        },
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        content: { type: String, default: "", maxlength: 5000 },
        media: { type: [mediaSchema], default: [] },
        likedBy: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
            default: [],
        },
        likesCount: { type: Number, default: 0 },
        commentsCount: { type: Number, default: 0 },
    },
    { timestamps: true },
);

projectFeedPostSchema.index({ projectId: 1, createdAt: -1 });

export default mongoose.model("ProjectFeedPost", projectFeedPostSchema);

