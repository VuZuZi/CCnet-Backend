import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },      
  publicId: { type: String, required: true },
  blurHash: { type: String, default: null }, 
  width: Number,
  height: Number,
  aspectRatio: Number 
}, { _id: false });

const authorShortSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  fullName: { type: String, required: true },
  avatar: String,
  username: String
}, { _id: false });

const commentShortSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  content: { type: String, required: true, maxlength: 2000 },
  author: authorShortSchema,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const postSchema = new mongoose.Schema(
  {
    content: { type: String, trim: true, maxlength: 5000 }, 
    images: {
      type: [imageSchema],
      validate: [val => val.length <= 10, 'Hệ thống chỉ cho phép tối đa 10 ảnh mỗi bài viết']
    },

    author: { type: authorShortSchema, required: true },

    privacy: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public',
    },
    status: {
        type: String,
        enum: ['active', 'banned', 'hidden'], 
        default: 'active',
    },

    latestComments: {
      type: [commentShortSchema],
      validate: [val => val.length <= 3, 'Latest comments cannot exceed 3 items']
    },

    stats: {
        likes: { type: Number, default: 0, min: 0 },
        comments: { type: Number, default: 0, min: 0 },
        shares: { type: Number, default: 0, min: 0 },
        views: { type: Number, default: 0, min: 0 }
    },

    hashtags: {
      type: [{ type: String, lowercase: true, trim: true }],
      validate: [val => val.length <= 30, 'Tối đa 30 hashtags']
    }, 
    
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, select: false }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

postSchema.index({ status: 1, privacy: 1, isDeleted: 1, _id: -1 }); 

postSchema.index({ "author._id": 1, isDeleted: 1, _id: -1 });

export default mongoose.model("Post", postSchema);