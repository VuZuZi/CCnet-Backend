import AppError from "../../core/AppError.js";

class ProjectFeedService {
  constructor({ projectRepository, volunteerRepository, projectFeedRepository }) {
    this.projectRepository = projectRepository;
    this.volunteerRepository = volunteerRepository;
    this.projectFeedRepository = projectFeedRepository;
  }

  async _getProjectOrThrow(projectId) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new AppError("Không tìm thấy dự án!", 404);
    return project;
  }

  async _canInteract(project, userId) {
    if (!userId) return false;
    if (String(project.organizerId) === String(userId)) return true;
    const application = await this.volunteerRepository.application({
      volunteerId: userId,
      opportunityId: project._id,
    });
    return Boolean(application && application.status === "APPROVED");
  }

  async getPosts(projectId, { limit = 10, cursor = null, userId = null } = {}) {
    const project = await this._getProjectOrThrow(projectId);
    const posts = await this.projectFeedRepository.listPosts(project._id, {
      limit,
      cursor,
    });

    const commentsMap = await this.projectFeedRepository.listLatestCommentsByPostIds(
      posts.map((p) => p._id),
      2,
    );

    const enriched = posts.map((p) => {
      const latestComments = commentsMap.get(String(p._id)) || [];
      const likedByMe = userId
        ? (p.likedBy || []).some((id) => String(id) === String(userId))
        : false;
      return {
        ...p,
        author: p.authorId,
        authorId: undefined,
        likedByMe,
        latestComments: latestComments.map((c) => ({
          ...c,
          author: c.authorId,
          authorId: undefined,
        })),
      };
    });

    const nextCursor =
      enriched.length > 0 ? String(enriched[enriched.length - 1]._id) : null;

    return { posts: enriched, nextCursor };
  }

  async createPost(projectId, { userId, content = "", media = [] }) {
    const project = await this._getProjectOrThrow(projectId);
    const can = await this._canInteract(project, userId);
    if (!can)
      throw new AppError(
        "Chỉ nhà tổ chức hoặc tình nguyện viên đã được duyệt mới có thể đăng bài.",
        403,
      );

    const trimmed = String(content || "").trim();
    if (!trimmed && (!Array.isArray(media) || media.length === 0)) {
      throw new AppError("Nội dung bài viết không được rỗng.", 400);
    }

    const sanitizedMedia = Array.isArray(media)
      ? media
        .map((m) => ({
          url: m?.url,
          publicId: m?.publicId,
          mediaType: m?.mediaType === "video" ? "video" : "image",
        }))
        .filter((m) => Boolean(m.url && m.publicId))
      : [];

    const created = await this.projectFeedRepository.createPost({
      projectId: project._id,
      authorId: userId,
      content: trimmed,
      media: sanitizedMedia,
    });

    const full = await this.projectFeedRepository.findPostById(created._id);
    return {
      ...full,
      author: full.authorId,
      authorId: undefined,
      likedByMe: false,
      latestComments: [],
    };
  }

  async createComment(projectId, postId, { userId, content }) {
    const project = await this._getProjectOrThrow(projectId);
    const can = await this._canInteract(project, userId);
    if (!can)
      throw new AppError(
        "Chỉ nhà tổ chức hoặc tình nguyện viên đã được duyệt mới có thể bình luận.",
        403,
      );

    const trimmed = String(content || "").trim();
    if (!trimmed) throw new AppError("Bình luận không được rỗng.", 400);

    const created = await this.projectFeedRepository.createComment({
      projectId: project._id,
      postId,
      authorId: userId,
      content: trimmed,
    });
    await this.projectFeedRepository.incrementPostCommentsCount(postId, 1);
    const full = await this.projectFeedRepository.findCommentById(created._id);
    return {
      ...full,
      author: full.authorId,
      authorId: undefined,
      likedByMe: false,
    };
  }

  async listComments(projectId, postId, { limit = 20, cursor = null, userId = null } = {}) {
    const project = await this._getProjectOrThrow(projectId);
    const comments = await this.projectFeedRepository.listComments(postId, {
      limit,
      cursor,
    });

    const shaped = comments.map((c) => ({
      ...c,
      author: c.authorId,
      authorId: undefined,
      likedByMe: userId
        ? (c.likedBy || []).some((id) => String(id) === String(userId))
        : false,
    }));

    const nextCursor =
      shaped.length > 0 ? String(shaped[shaped.length - 1]._id) : null;

    return { comments: shaped, nextCursor };
  }

  async togglePostLike(projectId, postId, userId) {
    const project = await this._getProjectOrThrow(projectId);
    const can = await this._canInteract(project, userId);
    if (!can) throw new AppError("Bạn không có quyền thả tim.", 403);

    const result = await this.projectFeedRepository.togglePostLike(postId, userId);
    if (!result) throw new AppError("Không tìm thấy bài viết.", 404);

    return {
      liked: result.liked,
      post: {
        ...result.post,
        author: result.post.authorId,
        authorId: undefined,
        likedByMe: result.liked,
      },
    };
  }

  async toggleCommentLike(projectId, commentId, userId) {
    const project = await this._getProjectOrThrow(projectId);
    const can = await this._canInteract(project, userId);
    if (!can) throw new AppError("Bạn không có quyền thả tim.", 403);

    const result = await this.projectFeedRepository.toggleCommentLike(
      commentId,
      userId,
    );
    if (!result) throw new AppError("Không tìm thấy bình luận.", 404);

    return {
      liked: result.liked,
      comment: {
        ...result.comment,
        author: result.comment.authorId,
        authorId: undefined,
        likedByMe: result.liked,
      },
    };
  }
}

export default ProjectFeedService;
