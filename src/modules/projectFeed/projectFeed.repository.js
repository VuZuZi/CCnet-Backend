import mongoose from "mongoose";
import ProjectFeedPost from "./projectFeedPost.model.js";
import ProjectFeedComment from "./projectFeedComment.model.js";

class ProjectFeedRepository {
  async listPosts(projectId, { limit = 10, cursor = null } = {}) {
    const filter = { projectId: new mongoose.Types.ObjectId(projectId) };
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const posts = await ProjectFeedPost.find(filter)
      .sort({ _id: -1 })
      .limit(Math.min(Math.max(Number(limit) || 10, 1), 30))
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();

    return posts;
  }

  async listLatestCommentsByPostIds(postIds, perPostLimit = 2) {
    const ids = postIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (ids.length === 0) return new Map();

    const all = await ProjectFeedComment.find({ postId: { $in: ids } })
      .sort({ createdAt: -1 })
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();

    const map = new Map();
    for (const c of all) {
      const key = String(c.postId);
      const arr = map.get(key) || [];
      if (arr.length < perPostLimit) arr.push(c);
      map.set(key, arr);
    }
    return map;
  }

  async createPost({ projectId, authorId, content, media }) {
    console.log('[ProjectFeedRepository.createPost] Creating post with:', {
      projectId: projectId.toString?.() || projectId,
      authorId: authorId.toString?.() || authorId,
      contentLength: content?.length || 0,
      mediaCount: media?.length || 0,
      media: media
    });

    const created = await ProjectFeedPost.create({
      projectId,
      authorId,
      content,
      media,
    });

    console.log('[ProjectFeedRepository.createPost] Post created:', {
      postId: created._id.toString(),
      mediaCount: created.media?.length || 0,
      media: created.media
    });

    return created;
  }

  async createComment({ projectId, postId, authorId, content }) {
    const created = await ProjectFeedComment.create({
      projectId,
      postId,
      authorId,
      content,
    });
    return created;
  }

  async incrementPostCommentsCount(postId, delta) {
    return await ProjectFeedPost.findByIdAndUpdate(
      postId,
      { $inc: { commentsCount: delta } },
      { new: true },
    )
      .lean()
      .exec();
  }

  async togglePostLike(postId, userId) {
    const post = await ProjectFeedPost.findById(postId)
      .select("_id likedBy likesCount")
      .lean()
      .exec();
    if (!post) return null;

    const userStr = String(userId);
    const liked = (post.likedBy || []).some((id) => String(id) === userStr);

    const updated = await ProjectFeedPost.findByIdAndUpdate(
      postId,
      liked
        ? { $pull: { likedBy: userId }, $inc: { likesCount: -1 } }
        : { $addToSet: { likedBy: userId }, $inc: { likesCount: 1 } },
      { new: true },
    )
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();

    return { post: updated, liked: !liked };
  }

  async toggleCommentLike(commentId, userId) {
    const comment = await ProjectFeedComment.findById(commentId)
      .select("_id likedBy likesCount")
      .lean()
      .exec();
    if (!comment) return null;

    const userStr = String(userId);
    const liked = (comment.likedBy || []).some((id) => String(id) === userStr);

    const updated = await ProjectFeedComment.findByIdAndUpdate(
      commentId,
      liked
        ? { $pull: { likedBy: userId }, $inc: { likesCount: -1 } }
        : { $addToSet: { likedBy: userId }, $inc: { likesCount: 1 } },
      { new: true },
    )
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();

    return { comment: updated, liked: !liked };
  }

  async findPostById(postId) {
    return await ProjectFeedPost.findById(postId)
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();
  }

  async findCommentById(commentId) {
    return await ProjectFeedComment.findById(commentId)
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();
  }

  async listComments(postId, { limit = 20, cursor = null } = {}) {
    const filter = { postId: new mongoose.Types.ObjectId(postId) };
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const comments = await ProjectFeedComment.find(filter)
      .sort({ _id: -1 })
      .limit(Math.min(Math.max(Number(limit) || 20, 1), 50))
      .populate({ path: "authorId", select: "fullName avatar isVerified role" })
      .lean()
      .exec();

    return comments;
  }
}

export default ProjectFeedRepository;

