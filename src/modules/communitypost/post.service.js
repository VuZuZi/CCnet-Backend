import mongoose from "mongoose";
import AppError from "../../core/AppError.js";
import Follow from "../follow/follow.model.js";
import { DOMAIN_EVENTS } from "../notification/constants/notification.events.js";

class PostService {
  constructor({
    postRepository,
    mediaService,
    userRepository,
    redis,
    eventBus,
  }) {
    this.postRepository = postRepository;
    this.mediaService = mediaService;
    this.userRepository = userRepository;
    this.redis = redis;
    this.eventBus = eventBus;
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

  _getUserId(user) {
    return user?.userId || user?._id || user?.id || null;
  }

  _formatUserMini(user) {
    if (!user) return null;

    return {
      _id: this._getUserId(user),
      fullName: user.fullName || user.name || user.email || "Người dùng",
      avatar: user.avatar || "",
      username: user.username || "",
    };
  }

  async _getFreshUserMini(user) {
    const userId = this._getUserId(user);

    if (!userId) {
      return this._formatUserMini(user);
    }

    try {
      const freshUser = await this.userRepository.findById(userId);

      if (freshUser) {
        return {
          _id: freshUser._id || freshUser.id || userId,
          fullName:
            freshUser.fullName ||
            freshUser.name ||
            user?.fullName ||
            user?.email ||
            "Người dùng",
          avatar: freshUser.avatar || user?.avatar || "",
          username: freshUser.username || user?.username || "",
        };
      }
    } catch (error) {
      console.error("[PostService] Cannot load fresh user mini:", error);
    }

    return this._formatUserMini(user);
  }

  _normalizePostObject(post) {
    return post?.toObject?.() || post;
  }

  _resolvePostOwnerId(post) {
    if (!post || !post.author) return null;

    if (typeof post.author === "object" && post.author._id) {
      return String(post.author._id);
    }

    return String(post.author);
  }

  async _hydratePostAuthors(posts) {
    if (!posts?.length) return posts || [];

    const normalizedPosts = posts.map((post) => this._normalizePostObject(post));

    const authorIds = [
      ...new Set(
        normalizedPosts
          .map((post) => post?.author?._id || post?.author?.id)
          .filter(Boolean)
          .map(String),
      ),
    ];

    if (!authorIds.length) return normalizedPosts;

    const usersMap = new Map();

    await Promise.all(
      authorIds.map(async (authorId) => {
        try {
          const user = await this.userRepository.findById(authorId);
          if (user) {
            usersMap.set(String(authorId), user);
          }
        } catch {
          // Không chặn feed nếu 1 user lỗi
        }
      }),
    );

    return normalizedPosts.map((post) => {
      const authorId = post?.author?._id || post?.author?.id;
      const freshUser = authorId ? usersMap.get(String(authorId)) : null;

      if (!freshUser) return post;

      return {
        ...post,
        author: {
          _id: post.author?._id || freshUser._id || authorId,
          fullName:
            freshUser.fullName ||
            post.author?.fullName ||
            post.author?.username ||
            "Người dùng",
          avatar: freshUser.avatar || post.author?.avatar || "",
          username: freshUser.username || post.author?.username || "",
        },
        latestComments: Array.isArray(post.latestComments)
          ? post.latestComments.map((comment) => comment)
          : [],
      };
    });
  }

  async _canViewerSeePost(post, viewerId) {
    if (!post) return false;

    if (post.privacy !== "private") return true;

    const ownerId = this._resolvePostOwnerId(post);
    if (!ownerId) return false;
    if (!viewerId) return false;

    if (String(ownerId) === String(viewerId)) return true;

    const followsOwner = await Follow.exists({
      followerId: viewerId,
      followingId: ownerId,
    });

    return Boolean(followsOwner);
  }

  async _invalidateCache(postId) {
    const promises = [this._invalidateFeedCacheBackground()];
    if (postId) promises.push(this.redis.del(`post:${postId}`));
    await Promise.allSettled(promises);
  }

  async createPost({ user, content, files, privacy, type, sharedEntity }) {
    const authorMini = await this._getFreshUserMini(user);

    if (!authorMini?._id) {
      throw new AppError("Không xác định được người đăng bài.", 401);
    }

    let images = [];
    if (files?.length) {
      const uploaded = await this.mediaService.uploadMultiple(
        files,
        authorMini._id,
        "post",
      );
      images = uploaded.map(this._formatImage);
    }

    const cleanContent = content?.trim();
    if (!cleanContent && !images.length && !sharedEntity) {
      throw new AppError(
        "Bạn ơi, nội dung bài viết không được để trống đâu nè.",
        400,
      );
    }

    const newPost = await this.postRepository.create({
      author: authorMini,
      content: cleanContent,
      hashtags: this._extractHashtags(cleanContent),
      images,
      privacy: privacy || "public",
      type: type || "normal",
      sharedEntity: sharedEntity || null,
      stats: { likes: 0, comments: 0, shares: 0, views: 0 },
    });

    await this._invalidateCache(newPost?._id);
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

    if (!post) {
      throw new AppError(
        "Rất tiếc, hệ thống không tìm thấy bài viết hoặc bạn không có quyền chỉnh sửa.",
        404,
      );
    }

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

    if (images.length > 10) {
      throw new AppError(
        "Bạn chỉ có thể đăng tối đa 10 ảnh trong mỗi bài viết thôi nhé.",
        400,
      );
    }

    const updateData = {
      images,
      privacy: privacy || post.privacy,
      content: content?.trim() ?? post.content,
      hashtags:
        content !== undefined ? this._extractHashtags(content) : post.hashtags,
      isEdited: true,
    };

    const updated = await this.postRepository.updatePost(
      postId,
      userId,
      updateData,
    );

    this._invalidateCache(postId);
    return updated;
  }

  _shapeComment(comment, reactionsMap = new Map(), replies = []) {
    if (!comment) return null;
    const commentObject = comment.toObject?.() || comment;
    const commentId = commentObject._id?.toString?.() || String(commentObject._id);
    const reaction = reactionsMap.get(commentId) || null;

    return {
      ...commentObject,
      likesCount: Math.max(0, commentObject.likesCount || 0),
      likedByMe: reaction === "like",
      userReaction: reaction,
      replies,
    };
  }

  async _attachUserCommentReactions(comments, viewerId) {
    if (!viewerId || !comments.length) return new Map();

    const ids = comments.map((comment) => comment._id).filter(Boolean);
    const reactions = await this.postRepository.getReactionsByUserAndTargets(
      viewerId,
      ids,
      "Comment",
    );

    return new Map(
      reactions.map((reaction) => [
        reaction.targetId.toString(),
        reaction.type,
      ]),
    );
  }

  async addComment({ postId, user, content, parentCommentId = null }) {
    const targetPost = await this.postRepository.findById(postId);
    if (!targetPost) {
      throw new AppError(
        "Rất tiếc, bài viết này không còn tồn tại hoặc đã bị xóa.",
        404,
      );
    }

    const trimmedContent = content?.trim();
    if (!trimmedContent) {
      throw new AppError("Nội dung bình luận không được để trống bạn nhé.", 400);
    }

    const authorMini = await this._getFreshUserMini(user);

    let normalizedParentCommentId = null;
    if (parentCommentId) {
      const parentComment =
        await this.postRepository.findCommentById(parentCommentId);

      if (!parentComment || String(parentComment.postId) !== String(postId)) {
        throw new AppError(
          "Bình luận bạn đang trả lời không còn tồn tại.",
          404,
        );
      }

      normalizedParentCommentId =
        parentComment.parentCommentId || parentComment._id;
    }

    const newComment = await mongoose.connection.transaction(
      async (session) => {
        const createdComment = await this.postRepository.createComment(
          {
            postId,
            author: authorMini._id,
            content: trimmedContent,
            parentCommentId: normalizedParentCommentId,
          },
          session,
        );

        if (normalizedParentCommentId) {
          await this.postRepository.incrementPostStats(
            postId,
            "comments",
            1,
            session,
          );
        } else {
          await this.postRepository.pushLatestCommentToPost(
            postId,
            {
              _id: createdComment._id,
              content: createdComment.content,
              createdAt: createdComment.createdAt || new Date(),
              author: authorMini,
              likesCount: 0,
              parentCommentId: null,
            },
            session,
          );
        }

        this.redis.del(`post:${postId}`).catch(() => null);
        return createdComment;
      },
    );

    const postOwnerId = this._resolvePostOwnerId(targetPost);
    const actorId = String(authorMini._id);

    console.log("[POST COMMENT] owner/actor", {
      postId: String(postId),
      postOwnerId,
      actorId,
      commentId: String(newComment._id),
    });

    if (postOwnerId && postOwnerId !== actorId && this.eventBus) {
      console.log("[POST COMMENT] emitting notification event");

      await this.eventBus.emit(DOMAIN_EVENTS.POST_COMMENTED, {
        recipientId: postOwnerId,
        actorId,
        actorName: authorMini.fullName || authorMini.username || "Someone",
        actorAvatar: authorMini.avatar || null,
        postId: String(postId),
        commentId: String(newComment._id),
        previewContent: newComment.content,
        message: `${authorMini.fullName || authorMini.username || "Ai đó"} đã bình luận về bài viết của bạn.`,
      });
    }

    if (parentCommentId && this.eventBus) {
      const parentComment = await this.postRepository.findCommentById(
        normalizedParentCommentId,
      );
      const parentAuthorId =
        parentComment?.author?._id || parentComment?.author || null;

      if (parentAuthorId && String(parentAuthorId) !== actorId) {
        await this.eventBus.emit(DOMAIN_EVENTS.COMMENT_REPLIED, {
          recipientId: String(parentAuthorId),
          actorId,
          actorName: authorMini.fullName || authorMini.username || "Someone",
          actorAvatar: authorMini.avatar || null,
          postId: String(postId),
          commentId: String(newComment._id),
          parentCommentId: String(normalizedParentCommentId),
          previewContent: newComment.content,
        });
      }
    }

    return this._shapeComment({
      ...(newComment.toObject?.() || newComment),
      author: authorMini,
      likesCount: 0,
      likedByMe: false,
      userReaction: null,
      replies: [],
    });
  }

  async toggleReaction({ postId, userId, type }) {
    const targetPost = await this.postRepository.findById(postId);
    if (!targetPost) {
      throw new AppError("Không tìm thấy bài viết để thực hiện tương tác.", 404);
    }

    const result = await mongoose.connection.transaction(async (session) => {
      const existingReaction = await this.postRepository.getReaction(
        { userId, postId },
        session,
      );

      const oldType = existingReaction ? existingReaction.type : null;
      const nextResult = { action: "created", type };
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
        nextResult.action = "removed";
        nextResult.type = null;

        if (oldType === "like") {
          likeChange = -1;
        }
      } else {
        await this.postRepository.updateReaction(
          { userId, postId, type },
          session,
        );
        nextResult.action = "switched";

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
      return nextResult;
    });

    const postOwnerId = this._resolvePostOwnerId(targetPost);
    const actorId = String(userId);

    console.log("[POST REACTION] owner/actor", {
      postId: String(postId),
      postOwnerId,
      actorId,
      type,
      result,
    });

    const shouldNotify =
      type === "like" &&
      result.action !== "removed" &&
      postOwnerId &&
      postOwnerId !== actorId;

    if (shouldNotify && this.eventBus) {
      console.log("[POST REACTION] emitting notification event");

      const actor = await this.userRepository
        ?.findById?.(userId)
        .catch(() => null);

      await this.eventBus.emit(DOMAIN_EVENTS.POST_REACTED, {
        recipientId: postOwnerId,
        actorId,
        actorName: actor?.fullName || actor?.username || "Someone",
        actorAvatar: actor?.avatar || null,
        postId: String(postId),
        reactionType: type,
      });
    }

    return result;
  }

  async _getFollowingIds(userId) {
    if (!userId) return [];

    const followingDocs = await Follow.find({ followerId: userId })
      .select("followingId")
      .lean();

    return followingDocs.map((d) => d.followingId);
  }

  async getNewsFeed({
    cursor,
    limit = 10,
    userId,
    type,
    profileUserId = null,
  }) {
    let filter = { status: "active" };
    const isProfileFeed = type === "profile";
    let useCache = false;

    if (type === "following") {
      if (!userId) {
        throw new AppError(
          "Bạn vui lòng đăng nhập để xem nội dung từ những người đang theo dõi nhé.",
          401,
        );
      }

      const followingIds = await this._getFollowingIds(userId);

      if (!followingIds.length) {
        return { data: [], paging: { nextCursor: null, hasMore: false } };
      }

      filter["author._id"] = { $in: followingIds };
    } else if (isProfileFeed) {
      const profileOwnerId = profileUserId || userId;
      if (!profileOwnerId) {
        return { data: [], paging: { nextCursor: null, hasMore: false } };
      }

      filter["author._id"] = profileOwnerId;

      const isOwnerView = userId && String(userId) === String(profileOwnerId);

      if (!isOwnerView) {
        if (userId) {
          const isFollowing = await Follow.exists({
            followerId: userId,
            followingId: profileOwnerId,
          });

          if (!isFollowing) {
            filter.privacy = "public";
          }
        } else {
          filter.privacy = "public";
        }
      }
    } else {
      if (userId) {
        const followingIds = await this._getFollowingIds(userId);
        const allowedPrivateAuthors = [userId, ...followingIds];

        filter.$or = [
          { privacy: "public" },
          { privacy: "private", "author._id": { $in: allowedPrivateAuthors } },
        ];
      } else {
        filter.privacy = "public";
        useCache = true;
      }
    }

    const cacheKey = useCache ? this._getFeedKey(cursor, limit) : null;
    let posts = useCache ? await this._getCachedData(cacheKey) : null;

    if (!posts) {
      posts = await this.postRepository.getPosts({
        filter,
        limit,
        lastId: cursor,
      });

      if (useCache && posts.length) {
        this.redis
          .set(cacheKey, JSON.stringify(posts), "EX", this.TTL.FEED)
          .catch(() => null);
      }
    }

    if (!posts?.length) {
      return { data: [], paging: { nextCursor: null, hasMore: false } };
    }

    posts = await this._hydratePostAuthors(posts);

    let data = await this._attachUserReactions(posts, userId);
    data = await this._attachUserSavedState(data, userId);

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

  async getPostById(id, viewerId = null) {
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

    if (!post) return null;

    const canView = await this._canViewerSeePost(post, viewerId);
    if (!canView) return null;

    const hydratedPosts = await this._hydratePostAuthors([post]);
    return hydratedPosts[0] || post;
  }

  async getComments({
    postId,
    page = 1,
    limit = 10,
    sort = "relevant",
    viewerId = null,
  }) {
    const post = await this.postRepository.findById(postId);
    if (!post) {
      throw new AppError("Post not found", 404);
    }

    const canView = await this._canViewerSeePost(post, viewerId);
    if (!canView) {
      throw new AppError(
        "Rất tiếc, bài viết này ở chế độ riêng tư nên bạn không thể xem được.",
        403,
      );
    }

    const skip = (page - 1) * limit;

    const comments = await this.postRepository.getCommentsByPostId({
      postId,
      skip,
      limit,
      sort,
      parentCommentId: null,
    });

    const rootTotal = await this.postRepository.countCommentsByPostId({
      postId,
      parentCommentId: null,
    });
    const replies = await this.postRepository.getRepliesByParentIds(
      comments.map((comment) => comment._id),
    );
    const reactionsMap = await this._attachUserCommentReactions(
      [...comments, ...replies],
      viewerId,
    );

    const repliesByParent = replies.reduce((map, reply) => {
      const parentId =
        reply.parentCommentId?.toString?.() || String(reply.parentCommentId);
      const bucket = map.get(parentId) || [];
      bucket.push(this._shapeComment(reply, reactionsMap));
      map.set(parentId, bucket);
      return map;
    }, new Map());

    const data = comments.map((comment) => {
      const commentId = comment._id?.toString?.() || String(comment._id);
      return this._shapeComment(
        comment,
        reactionsMap,
        repliesByParent.get(commentId) || [],
      );
    });

    return {
      data,
      total: post.stats?.comments || rootTotal,
      rootTotal,
      page,
      limit,
      hasMore: skip + comments.length < rootTotal,
    };
  }

  async toggleCommentReaction({ postId, commentId, userId, type }) {
    const targetPost = await this.postRepository.findById(postId);
    if (!targetPost) {
      throw new AppError(
        "Không tìm thấy bài viết để thực hiện tương tác.",
        404,
      );
    }

    const targetComment = await this.postRepository.findCommentById(commentId);
    if (!targetComment || String(targetComment.postId) !== String(postId)) {
      throw new AppError(
        "Không tìm thấy bình luận để tương tác.",
        404,
      );
    }

    const result = await mongoose.connection.transaction(async (session) => {
      const existingReaction = await this.postRepository.getReaction(
        { userId, commentId, targetType: "Comment" },
        session,
      );

      const oldType = existingReaction ? existingReaction.type : null;
      const nextResult = { action: "created", type };
      let likeChange = 0;

      if (!existingReaction) {
        await this.postRepository.createReaction(
          { userId, commentId, targetType: "Comment", type },
          session,
        );
        if (type === "like") likeChange = 1;
      } else if (oldType === type) {
        await this.postRepository.deleteReaction(
          { userId, commentId, targetType: "Comment" },
          session,
        );
        nextResult.action = "removed";
        nextResult.type = null;
        if (oldType === "like") likeChange = -1;
      } else {
        await this.postRepository.updateReaction(
          { userId, commentId, targetType: "Comment" },
          session,
        );
        nextResult.action = "switched";
        if (oldType === "like" && type === "dislike") {
          likeChange = -1;
        } else if (oldType === "dislike" && type === "like") {
          likeChange = 1;
        }
      }

      let updatedComment = targetComment;
      if (likeChange !== 0) {
        updatedComment = await this.postRepository.incrementCommentLikes(
          commentId,
          likeChange,
          session,
        );
      }

      return {
        ...nextResult,
        comment: this._shapeComment(
          updatedComment,
          new Map([[String(commentId), nextResult.type]]),
        ),
      };
    });

    const commentAuthorId =
      targetComment?.author?._id || targetComment?.author || null;
    const shouldNotify =
      type === "like" &&
      result.action !== "removed" &&
      commentAuthorId &&
      String(commentAuthorId) !== String(userId) &&
      this.eventBus;

    if (shouldNotify) {
      const actor = await this.userRepository
        ?.findById?.(userId)
        .catch(() => null);

      await this.eventBus.emit(DOMAIN_EVENTS.COMMENT_REACTED, {
        recipientId: String(commentAuthorId),
        actorId: String(userId),
        actorName: actor?.fullName || actor?.username || "Someone",
        actorAvatar: actor?.avatar || null,
        postId: String(postId),
        commentId: String(commentId),
        reactionType: type,
      });
    }

    return result;
  }

  async deletePost({ postId, userId }) {
    const deleted = await this.postRepository.softDeletePost(postId, userId);
    if (!deleted) {
      throw new AppError(
        "Không tìm thấy bài viết hoặc bạn không có quyền thực hiện xóa bài này.",
        404,
      );
    }

    this._invalidateCache(postId);
    return { message: "Xóa bài viết thành công." };
  }

  async toggleSavePost(postId, userId) {
    const targetPost = await this.postRepository.findById(postId);
    if (!targetPost) throw new AppError("Post not found", 404);

    const result = await this.userRepository.toggleSavePost(userId, postId);
    return result;
  }

  async getSavedPosts({ cursor, limit = 10, userId }) {
    if (!userId) {
      throw new AppError(
        "Bạn vui lòng đăng nhập để xem danh sách bài viết đã lưu nhé.",
        401,
      );
    }

    const user = await this.userRepository.findById(userId);
    const savedPostIds = user?.savedPosts || [];

    if (!savedPostIds.length) {
      return { data: [], paging: { nextCursor: null, hasMore: false } };
    }

    const filter = {
      _id: { $in: savedPostIds },
      status: "active",
      isDeleted: false,
    };

    let posts = await this.postRepository.getPosts({
      filter,
      limit,
      lastId: cursor,
    });

    if (posts?.length) {
      const visibilityChecks = await Promise.all(
        posts.map((post) => this._canViewerSeePost(post, userId)),
      );
      posts = posts.filter((_, index) => visibilityChecks[index]);
    }

    if (!posts?.length) {
      return { data: [], paging: { nextCursor: null, hasMore: false } };
    }

    posts = await this._hydratePostAuthors(posts);

    let data = await this._attachUserReactions(posts, userId);
    data = data.map((p) => ({ ...p, isSaved: true }));
    data = await this._attachUserSavedState(data, userId);

    return {
      data,
      paging: {
        nextCursor: data.length ? data[data.length - 1]._id : null,
        hasMore: data.length === limit,
      },
    };
  }

  async _attachUserSavedState(posts, userId) {
    if (!userId) return posts.map((p) => ({ ...p, isSaved: false }));
    const user = await this.userRepository.findById(userId);

    const savedIdsArray = (user?.savedPosts || []).map((id) => id.toString());

    return posts.map((p) => {
      const postIdStr = p._id
        ? p._id.toString()
        : p.id
          ? p.id.toString()
          : null;
      return {
        ...p,
        isSaved: postIdStr ? savedIdsArray.includes(postIdStr) : false,
      };
    });
  }
}

export default PostService;