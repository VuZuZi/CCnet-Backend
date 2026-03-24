import mongoose from "mongoose";
import AppError from "../../core/AppError.js";

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

  // --- PRIVATE HELPERS ---
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

  _formatImage(m) {
    return {
      url: m.url,
      publicId: m.publicId,
      blurHash: m.blurHash,
      width: m.width,
      height: m.height,
      aspectRatio: m.height ? m.width / m.height : 1,
    };
  }

  async _invalidateCache(postId) {
    try {
      if (postId) await this.redis.del(`post:${postId}`);
      await this._invalidateFeedCacheBackground();
    } catch (e) {
      console.error("[Cache] Invalidate failed", e);
    }
  }

  // --- MAIN METHODS ---
  async createPost({ user, content, files, privacy }) {
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
    if (!cleanContent && !images.length)
      throw new AppError("Post content or image required", 400);

    const newPost = await this.postRepository.create({
      author: {
        _id: user.userId,
        fullName: user.fullName,
        avatar: user.avatar,
        username: user.username,
      },
      content: cleanContent,
      hashtags: this._extractHashtags(cleanContent),
      images,
      privacy: privacy || "public",
      stats: { likes: 0, comments: 0, shares: 0, views: 0 },
    });

    await this.redis.del(this._getFeedKey(null, 10)); // Xóa nhanh trang đầu
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
    if (!post) throw new AppError("Post not found or permission denied", 404);

    let images = post.images.filter(
      (img) => !removeFiles?.includes(img.publicId),
    );
    if (removeFiles?.length)
      this.mediaService.deleteMultiple(removeFiles).catch(console.error);

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
    await this._invalidateCache(postId);
    return updated;
  }

  async addComment({ postId, user, content }) {
    const session = await mongoose.startSession();
    try {
      let newComment;
      await session.withTransaction(async () => {
        newComment = await this.postRepository.createComment(
          { postId, author: user.userId, content },
          session,
        );
        await this.postRepository.pushLatestCommentToPost(
          postId,
          {
            _id: newComment._id,
            content,
            createdAt: new Date(),
            author: {
              _id: user.userId,
              fullName: user.fullName,
              avatar: user.avatar,
              username: user.username,
            },
          },
          session,
        );
      });
      await this.redis.del(`post:${postId}`);
      return newComment;
    } finally {
      await session.endSession();
    }
  }

  async toggleReaction({ postId, userId, type }) {
    const session = await mongoose.startSession();
    try {
      const result = { action: "", type };
      await session.withTransaction(async () => {
        const existing = await this.postRepository.upsertReaction(
          { userId, postId, type },
          session,
        );
        const isUpdate = existing?.lastErrorObject?.updatedExisting;

        if (!isUpdate) {
          await this.postRepository.incrementPostStats(
            postId,
            "likes",
            1,
            session,
          );
          result.action = "created";
        } else if (existing.value?.type === type) {
          await this.postRepository.deleteReaction({ userId, postId }, session);
          await this.postRepository.incrementPostStats(
            postId,
            "likes",
            -1,
            session,
          );
          result.action = "removed";
          result.type = null;
        } else {
          result.action = "switched";
        }
      });
      await this.redis.del(`post:${postId}`);
      return result;
    } finally {
      await session.endSession();
    }
  }

  async getNewsFeed({ cursor, limit = 10, userId }) {
    const cacheKey = this._getFeedKey(cursor, limit);
    let posts = await this.redis
      .get(cacheKey)
      .then((d) => (d ? JSON.parse(d) : null))
      .catch(() => null);

    if (!posts) {
      posts = await this.postRepository.getPosts({
        filter: { status: "active", privacy: "public" },
        limit,
        lastId: cursor,
      });
      if (posts.length)
        this.redis
          .set(cacheKey, JSON.stringify(posts), "EX", this.TTL.FEED)
          .catch(console.error);
    }

    if (!posts?.length)
      return { data: [], paging: { nextCursor: null, hasMore: false } };

    const reactionsMap = new Map();
    if (userId) {
      const reactions = await this.postRepository.getReactionsByUserAndTargets(
        userId,
        posts.map((p) => p._id),
      );
      reactions.forEach((r) => reactionsMap.set(r.targetId.toString(), r.type));
    }

    const data = posts.map((p) => ({
      ...p,
      userReaction: reactionsMap.get(p._id.toString()) || null,
    }));
    return {
      data,
      paging: {
        nextCursor: data[data.length - 1]._id,
        hasMore: data.length === limit,
      },
    };
  }

  async getPostById(id) {
    const cached = await this.redis
      .get(`post:${id}`)
      .then((d) => (d ? JSON.parse(d) : null))
      .catch(() => null);
    if (cached) return cached;

    const post = await this.postRepository.findById(id);
    if (post)
      this.redis
        .set(`post:${id}`, JSON.stringify(post), "EX", this.TTL.POST)
        .catch(console.error);
    return post;
  }

  async deletePost({ postId, userId }) {
    const deleted = await this.postRepository.softDeletePost(postId, userId);
    if (!deleted) throw new AppError("Post not found", 404);
    await this._invalidateCache(postId);
    return { message: "Deleted" };
  }

  async _invalidateFeedCacheBackground() {
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        "feed:public:*",
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length)
        await (this.redis.unlink
          ? this.redis.unlink(keys)
          : this.redis.del(keys));
    } while (cursor !== "0");
  }
}

export default PostService;
