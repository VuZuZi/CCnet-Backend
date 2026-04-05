import ApiResponse from "../../core/Response.js";

class PostController {
  constructor({ postService, reportService }) {
    this.postService = postService;
    this.reportService = reportService;
  }

  getNewsFeed = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 10;
      const cursor = req.query.cursor || null;
      const currentUserId = req.user?.userId || null;

      // 1. LẤY BIẾN TYPE TỪ URL (Frontend đã gửi lên rồi)
      const type = req.query.type || "for-you";
      console.log("🚀 [Controller] Frontend yêu cầu bảng tin loại:", type);

      const result = await this.postService.getNewsFeed({
        cursor,
        limit,
        userId: currentUserId,
        type, // 2. TRUYỀN NÓ XUỐNG SERVICE CHỖ NÀY
      });

      return ApiResponse.success(res, result.data, result.paging);
    } catch (error) {
      next(error);
    }
  };

  getPostById = async (req, res, next) => {
    try {
      const post = await this.postService.getPostById(req.params.id);
      if (!post) {
        return ApiResponse.notFound(res, "Post not found");
      }
      return ApiResponse.success(res, post);
    } catch (error) {
      next(error);
    }
  };

  createPost = async (req, res, next) => {
    try {
      const { content, privacy, type } = req.body;
      let { sharedEntity } = req.body;
      const files = req.files || [];
      if (sharedEntity && typeof sharedEntity === "string") {
        try {
          sharedEntity = JSON.parse(sharedEntity);
        } catch (error) {
          console.error("Lỗi parse sharedEntity tại Controller:", error);
        }
      }

      const post = await this.postService.createPost({
        content,
        files,
        user: req.user,
        privacy,
        type: type || "normal",
        sharedEntity: sharedEntity || null,
      });

      return ApiResponse.created(res, post);
    } catch (error) {
      next(error);
    }
  };

  toggleReaction = async (req, res, next) => {
    try {
      const { type } = req.body;
      const result = await this.postService.toggleReaction({
        postId: req.params.id,
        userId: req.user.userId,
        type,
      });
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  reportPost = async (req, res, next) => {
    try {
      const reportData = {
        ...req.body,
        reporter_ref: req.user.userId,
        target_ref: req.params.id,
      };

      const report = await this.reportService.createReport(reportData);
      return ApiResponse.created(res, report);
    } catch (error) {
      next(error);
    }
  };

  addComment = async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content) return ApiResponse.badRequest(res, "Content is required");

      const comment = await this.postService.addComment({
        postId: req.params.id,
        user: req.user,
        content,
      });

      return ApiResponse.created(res, comment);
    } catch (error) {
      next(error);
    }
  };

  getComments = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const comments = await this.postService.getComments({
        postId: req.params.id,
        page,
      });
      return ApiResponse.success(res, comments);
    } catch (error) {
      next(error);
    }
  };

  deletePost = async (req, res, next) => {
    try {
      await this.postService.deletePost({
        postId: req.params.id,
        userId: req.user.userId,
      });

      return ApiResponse.success(res, { message: "Deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
  updatePost = async (req, res, next) => {
    try {
      const { content, privacy, removeFiles } = req.body;
      const newFiles = req.files || [];
      const postId = req.params.id;
      const userId = req.user.userId;

      const updatedPost = await this.postService.updatePost({
        postId,
        userId,
        content,
        privacy,
        newFiles,
        removeFiles,
      });

      if (!updatedPost) {
        return ApiResponse.notFound(
          res,
          "Post not found or you don't have permission",
        );
      }

      return ApiResponse.success(res, updatedPost, "Post updated successfully");
    } catch (error) {
      next(error);
    }
  };
}

export default PostController;
