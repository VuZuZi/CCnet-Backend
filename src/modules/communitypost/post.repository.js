import Post from "./post.model.js";
import Reaction from "./reaction.model.js";
import Comment from "./comment.model.js";
import mongoose from "mongoose";

class PostRepository {
  // === READ ===
  async findById(id) {
    return Post.findOne({ _id: id, isDeleted: false }).lean();
  }

  async getPosts({ filter, limit, lastId }) {
    const query = { ...filter, isDeleted: false };
    if (lastId) {
      query._id = { $lt: new mongoose.Types.ObjectId(lastId) };
    }
    return Post.find(query).sort({ _id: -1 }).limit(limit).lean(); 
  }

  async getReactionsByUserAndTargets(userId, targetIds) {
    if (!userId || targetIds.length === 0) return [];
    return Reaction.find({
      userId: userId,
      targetType: 'Post',
      targetId: { $in: targetIds }
    }).select('targetId type').lean();
  }

  async getComments(postId, skip, limit) {
    return Comment.find({ postId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .populate({ path: 'author', select: 'username fullName avatar' })
      .lean(); 
  }

  // === WRITE  ===
  async create(data, session = null) {
    const [post] = await Post.create([data], { session });
    return post;
  }

  async upsertReaction({ userId, postId, type }, session) {
    return Reaction.findOneAndUpdate(
      { userId, targetId: postId, targetType: 'Post' },
      { $set: { type } },
      { upsert: true, new: true, includeResultMetadata: true, session }
    );
  }

  async deleteReaction({ userId, postId }, session) {
    return Reaction.findOneAndDelete(
        { userId, targetId: postId, targetType: 'Post' },
        { session }
    );
  }

  async incrementPostStats(postId, field, amount, session) {
    return Post.updateOne(
      { _id: postId },
      { $inc: { [`stats.${field}`]: amount } },
      { session }
    );
  }

  async createComment(data, session) {
    const [comment] = await Comment.create([data], { session });
    return comment;
  }

  async pushLatestCommentToPost(postId, commentData, session) {
    return Post.updateOne(
      { _id: postId },
      {
        $inc: { 'stats.comments': 1 },
        $push: {
          latestComments: {
            $each: [commentData],
            $sort: { createdAt: -1 },
            $slice: 3
          }
        }
      }, { session }
    );
  }

  // === MAINTENANCE / BATCH SUPPORT  ===

  getPostsByAuthorCursor(authorId) {
    return Post.find({ "author._id": authorId }).cursor();
  }

  getPostsWithCommentByAuthorCursor(authorId) {
    return Post.find({ "latestComments.author._id": authorId }).cursor();
  }

  async bulkWrite(operations) {
    if (!operations.length) return;
    return Post.bulkWrite(operations, { ordered: false });
  }
}

export default PostRepository;