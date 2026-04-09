import mongoose from "mongoose";
import AppError from "../../core/AppError.js";
import Follow from "../follow/follow.model.js";

class PostService {
  constructor({ postRepository, mediaService, userRepository, redis }) {
    Object.assign(this, {
      postRepository,
      mediaService,
      userRepository,
      redis,
    });
    this.TTL = { FEED: 60, POST: 300 };
  }

  _extractHashtags(content) {
    if (!content) return [];
    const matches = content.match(/#[a-z0-9_]+/gi) || [];
    return [
      ...new Set(matches.map((tag) => tag.toLowerCase().replace("#", ""))),
    ];
  }

  _getFeedKey(cursor, limit) {
    return `feed:public:${limit}:${cursor || "start"}`;
  }

  _formatImage = (m) => ({
    url: m.url,
    publicId: m.publicId,
    blurHash: m.blurHash,
    width: m.width,
    height: m.height,
    aspectRatio: m.height ? m.width / m.height : 1,
  });

  _formatUserMini(user) {
    return {
      _id: user.userId || user._id,
      fullName: user.fullName,
      avatar: user.avatar,
      username: user.username,
    };
  }

  async _invalidateCache(postId) {
    const promises = [this._invalidateFeedCacheBackground()];
    if (postId) promises.push(this.redis.del(`post:${postId}`));
    await Promise.allSettled(promises);
  }

  async createPost({ user, content, files, privacy, type, sharedEntity }) {
    let images = [];
    if (files?.length) {
      const uploaded = await this.mediaService.uploadMultiple(
        files,
        user.userId,
        "post",
      );
      images = uploaded.map(this._formatImage);
    }

    const cleanContent = content?.trim();
    if (!cleanContent && !images.length && !sharedEntity) {
      throw new AppError("Nội dung bài viết không được để trống", 400);
    }

    const newPost = await this.postRepository.create({
      author: this._formatUserMini(user),
      content: cleanContent,
      hashtags: this._extractHashtags(cleanContent),
      images,
      privacy: privacy || "public",
      type: type || "normal",
      sharedEntity: sharedEntity || null,
      stats: { likes: 0, comments: 0, shares: 0, views: 0 },
    });

    this.redis.del(this._getFeedKey(null, 10)).catch(() => null);
    return newPost;
  }

  async updatePost({
    postId,
    userId,
    content,
    privacy,
    newFiles,
    removeFiles,
  }) {
    const post = await this.postRepository.findActivePostByIdAndAuthor(
      postId,
      userId,
    );

    if (!post)
      throw new AppError(
        "Không tìm thấy bài viết hoặc bạn không có quyền",
        404,
      );

    let images = post.images || [];
    if (removeFiles?.length) {
      images = images.filter((img) => !removeFiles.includes(img.publicId));

      this.mediaService.deleteMultiple(removeFiles).catch((err) => {
        console.error("🔥 Lỗi xóa ảnh thực tế:", err);
      });
    }

    if (newFiles?.length) {
      const uploaded = await this.mediaService.uploadMultiple(
        newFiles,
        userId,
        "post",
      );
      images.push(...uploaded.map(this._formatImage));
    }

    if (images.length > 10) throw new AppError("Tối đa 10 ảnh", 400);

    const updateData = {
      images,
      privacy: privacy || post.privacy,
      content: content?.trim() ?? post.content,
      hashtags:
        content !== undefined ? this._extractHashtags(content) : post.hashtags,
    };

    const updated = await this.postRepository.updatePost(
      postId,
      userId,
      updateData,
    );

    this._invalidateCache(postId);
    return updated;
  }

  async addComment({ postId, user, content }) {
    return mongoose.connection.transaction(async (session) => {
      const newComment = await this.postRepository.createComment(
        { postId, author: user.userId, content },
        session,
      );

      await this.postRepository.pushLatestCommentToPost(
        postId,
        {
          _id: newComment._id,
          content,
          createdAt: new Date(),
          author: this._formatUserMini(user),
        },
        session,
      );

      this.redis.del(`post:${postId}`).catch(() => null);
      return newComment;
    });
  }

  async toggleReaction({ postId, userId, type }) {
    return mongoose.connection.transaction(async (session) => {
      const existingReaction = await this.postRepository.getReaction(
        { userId, postId },
        session,
      );
      const oldType = existingReaction ? existingReaction.type : null;

      const result = { action: "created", type };
      let likeChange = 0;

      if (!existingReaction) {
        await this.postRepository.createReaction(
          { userId, postId, type },
          session,
        );
        if (type === "like") {
          likeChange = 1;
        }
      } else if (oldType === type) {
        await this.postRepository.deleteReaction({ userId, postId }, session);
        result.action = "removed";
        result.type = null;

        if (oldType === "like") {
          likeChange = -1;
        }
      } else {
        await this.postRepository.updateReaction(
          { userId, postId, type },
          session,
        );
        result.action = "switched";

        if (oldType === "like" && type === "dislike") {
          likeChange = -1;
        } else if (oldType === "dislike" && type === "like") {
          likeChange = 1;
        }
      }
      if (likeChange !== 0) {
        await this.postRepository.incrementPostStats(
          postId,
          "likes",
          likeChange,
          session,
        );
      }

      this.redis.del(`post:${postId}`).catch(() => null);

      return result;
    });
  }

  async getNewsFeed({ cursor, limit = 10, userId, type }) {
    let filter = { status: "active" };
    let isPublicFeed = type !== "following";

    if (type === "following") {
      if (!userId) throw new AppError("Vui lòng đăng nhập", 401);
      const followingDocs = await Follow.find({ followerId: userId })
        .select("followingId")
        .lean();
      const followingIds = followingDocs.map((d) => d.followingId);

      if (!followingIds.length)
        return { data: [], paging: { nextCursor: null, hasMore: false } };
      filter["author._id"] = { $in: followingIds };
    } else {
      filter.privacy = "public";
    }

    const cacheKey = isPublicFeed ? this._getFeedKey(cursor, limit) : null;
    let posts = isPublicFeed ? await this._getCachedData(cacheKey) : null;

    if (!posts) {
      posts = await this.postRepository.getPosts({
        filter,
        limit,
        lastId: cursor,
      });
      if (isPublicFeed && posts.length) {
        this.redis
          .set(cacheKey, JSON.stringify(posts), "EX", this.TTL.FEED)
          .catch(() => null);
      }
    }

    if (!posts?.length)
      return { data: [], paging: { nextCursor: null, hasMore: false } };

    const data = await this._attachUserReactions(posts, userId);

    return {
      data,
      paging: {
        nextCursor: data.length ? data[data.length - 1]._id : null,
        hasMore: data.length === limit,
      },
    };
  }

  async _getCachedData(key) {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async _attachUserReactions(posts, userId) {
    if (!userId) return posts;
    const reactions = await this.postRepository.getReactionsByUserAndTargets(
      userId,
      posts.map((p) => p._id),
    );
    const reactionsMap = new Map(
      reactions.map((r) => [r.targetId.toString(), r.type]),
    );
    return posts.map((p) => ({
      ...p,
      userReaction: reactionsMap.get(p._id.toString()) || null,
    }));
  }

  async _invalidateFeedCacheBackground() {
    let cursor = "0";
    const deleteMethod = this.redis.unlink ? "unlink" : "del";
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        "feed:public:*",
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length) await this.redis[deleteMethod](keys);
    } while (cursor !== "0");
  }
  async getPostById(id) {
    const cacheKey = `post:${id}`;
    let post = await this._getCachedData(cacheKey);

    if (!post) {
      post = await this.postRepository.findById(id);
      if (post) {
        this.redis
          .set(cacheKey, JSON.stringify(post), "EX", this.TTL.POST)
          .catch(() => null);
      }
    }
    return post;
  }
  async getComments({ postId, page = 1, sort = "relevant" }) {
    const limit = 10;
    const skip = (page - 1) * limit;

    const comments = await this.postRepository.getCommentsByPostId({
      postId,
      skip,
      limit,
      sort,
    });

    return { data: comments };
  }
  async deletePost({ postId, userId }) {
    const deleted = await this.postRepository.softDeletePost(postId, userId);
    if (!deleted)
      throw new AppError(
        "Không tìm thấy bài viết hoặc bạn không có quyền xóa",
        404,
      );

    this._invalidateCache(postId);
    return { message: "Deleted" };
  }
}

export default PostService;
