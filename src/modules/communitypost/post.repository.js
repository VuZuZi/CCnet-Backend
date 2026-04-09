import Post from "./post.model.js";
import Reaction from "./reaction.model.js";
import Comment from "./comment.model.js";
import mongoose from "mongoose";

class PostRepository {
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


  async findActivePostByIdAndAuthor(postId, authorId) {
    return Post.findOne({
      _id: postId,
      "author._id": authorId,
      isDeleted: false,
    }).lean();
  }

  async updatePost(postId, authorId, updateData) {
    return Post.findOneAndUpdate(
      { _id: postId, "author._id": authorId, isDeleted: false },
      { $set: updateData },
      { new: true },
    ).lean();
  }

  async getReactionsByUserAndTargets(userId, targetIds) {
    if (!userId || targetIds.length === 0) return [];
    return Reaction.find({
      userId: userId,
      targetType: "Post",
      targetId: { $in: targetIds },
    })
      .select("targetId type")
      .lean();
  }

  async getReaction({ userId, postId }, session) {
    return Reaction.findOne({
      userId,
      targetId: postId,
      targetType: "Post",
    }).session(session);
  }

  async getComments(postId, skip, limit) {
    return Comment.find({ postId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: "author", select: "username fullName avatar" })
      .lean();
  }

  async getCommentsByPostId({ postId, skip, limit, sort }) {
    let sortQuery = { createdAt: -1 };
    if (sort === "all") {
      sortQuery = { createdAt: 1 };
    } else if (sort === "relevant") {
      sortQuery = { createdAt: -1 };
    }

    return Comment.find({ postId, isDeleted: { $ne: true } })
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .populate("author", "_id fullName avatar username")
      .lean()
      .exec();
  }

  async create(data, session = null) {
    const [post] = await Post.create([data], { session });
    return post;
  }

  async createReaction({ userId, postId, type }, session) {
    const [reaction] = await Reaction.create(
      [{ userId, targetId: postId, targetType: "Post", type }],
      { session },
    );
    return reaction;
  }

  async updateReaction({ userId, postId, type }, session) {
    return Reaction.updateOne(
      { userId, targetId: postId, targetType: "Post" },
      { $set: { type } },
      { session },
    );
  }

  async deleteReaction({ userId, postId }, session) {
    return Reaction.findOneAndDelete(
      { userId, targetId: postId, targetType: "Post" },
      { session },
    );
  }

  async upsertReaction({ userId, postId, type }, session) {
    return Reaction.findOneAndUpdate(
      { userId, targetId: postId, targetType: "Post" },
      { $set: { type } },
      { upsert: true, new: true, includeResultMetadata: true, session },
    );
  }


  async incrementPostStats(postId, field, value, session) {
    const updatedPost = await Post.findOneAndUpdate(
      { _id: postId },
      { $inc: { [`stats.${field}`]: value } },
      { session, new: true },
    );
    if (updatedPost && updatedPost.stats.likes < 0) {
      await Post.updateOne(
        { _id: postId },
        { $set: { "stats.likes": 0 } },
        { session },
      );
    }
    return updatedPost;
  }

  async createComment(data, session) {
    const [comment] = await Comment.create([data], { session });
    return comment;
  }

  async pushLatestCommentToPost(postId, commentData, session) {
    return Post.updateOne(
      { _id: postId },
      {
        $inc: { "stats.comments": 1 },
        $push: {
          latestComments: {
            $each: [commentData],
            $sort: { createdAt: -1 },
            $slice: 3,
          },
        },
      },
      { session },
    );
  }

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

  async softDeletePost(postId, userId) {
    return Post.findOneAndUpdate(
      { _id: postId, "author._id": userId, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      },
      { new: true },
    );
  }
}

export default PostRepository;
