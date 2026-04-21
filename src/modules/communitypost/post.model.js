import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    blurHash: { type: String, default: null },
    width: Number,
    height: Number,
    aspectRatio: Number,
  },
  { _id: false },
);

const authorShortSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    fullName: { type: String, required: true },
    avatar: String,
    username: String,
  },
  { _id: false },
);

const commentShortSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    author: authorShortSchema,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const sharedEntitySchema = new mongoose.Schema(
  {
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    entityModel: {
      type: String,
      enum: ["Project", "NeedHelp"],
      required: true,
    },
    title: { type: String, required: true },
    thumbnail: { type: String }, // Link ảnh cover của project
    description: { type: String, maxlength: 500 },
    
    // 👇 CÁC TRƯỜNG BỔ SUNG ĐỂ ĐỒNG BỘ VỚI FRONTEND 👇
    ownerName: { type: String }, // Tên người đăng/tổ chức
    location: { type: String }, // Địa điểm thực hiện
    endDateText: { type: String }, // Text hiển thị thời gian (VD: "Còn 5 ngày")
    fundingPercent: { type: Number, default: 0 }, // Phần trăm gây quỹ
    isFunded: { type: Boolean, default: false }, // Cờ đánh dấu có gây quỹ không
    isUrgent: { type: Boolean, default: false } // Cờ khẩn cấp
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, maxlength: 5000 },
    images: {
      type: [imageSchema],
      validate: [
        (val) => val.length <= 10,
        "Hệ thống chỉ cho phép tối đa 10 ảnh mỗi bài viết",
      ],
    },

    author: { type: authorShortSchema, required: true },

    // 👇 2 TRƯỜNG MỚI ĐỂ QUẢN LÝ BÀI SHARE
    type: {
      type: String,
      enum: ["normal", "share_project", "need_help"],
      default: "normal",
    },
    sharedEntity: {
      type: sharedEntitySchema,
      default: null,
    },

    privacy: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "public",
    },
    status: {
      type: String,
      enum: ["active", "banned", "hidden"],
      default: "active",
    },

    latestComments: {
      type: [commentShortSchema],
      validate: [
        (val) => val.length <= 3,
        "Latest comments cannot exceed 3 items",
      ],
    },

    stats: {
      likes: { type: Number, default: 0, min: 0 },
      comments: { type: Number, default: 0, min: 0 },
      shares: { type: Number, default: 0, min: 0 },
      views: { type: Number, default: 0, min: 0 },
    },

    hashtags: {
      type: [{ type: String, lowercase: true, trim: true }],
      validate: [(val) => val.length <= 30, "Tối đa 30 hashtags"],
    },

    isEdited: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

postSchema.index({ status: 1, privacy: 1, isDeleted: 1, _id: -1 });
postSchema.index({ "author._id": 1, isDeleted: 1, _id: -1 });

export default mongoose.model("Post", postSchema);
