import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";

class ProjectController {
  constructor({ projectService, projectFeedService, reportService }) {
    this.projectService = projectService;
    this.projectFeedService = projectFeedService;
    this.reportService = reportService;
  }

  //     createDraft = async (req, res, next) => {
  //         try {
  //             const organizerId = req.user.userId;
  //             const projectData = { ...req.body };

  //             const files = {
  //                 coverMedia: req.files?.coverMedia ? req.files.coverMedia[0] : null,
  //                 documents: req.files?.documents || []
  //             };
  //             const result = await this.projectService.createDraftProject(organizerId, projectData, files);
  //             return ApiResponse.created(res, result, 'Đã lưu bản nháp dự án (Bước 1)');
  //         } catch (error) {
  //             next(error);
  //         }
  //     };

  //    updateDraft = async (req, res, next) => {
  //         try {
  //             const projectId = req.params.id;
  //             const organizerId = req.user.userId;
  //             const updateData = { ...req.body };

  //             const files = {
  //                 coverMedia: req.files?.coverMedia ? req.files.coverMedia[0] : null,
  //                 documents: req.files?.documents || []
  //             };

  //             const result = await this.projectService.updateDraftProject(projectId, organizerId, updateData, files);
  //             return ApiResponse.success(res, result, 'Đã cập nhật bản nháp dự án (Bước 2)');
  //         } catch (error) {
  //             next(error);
  //         }
  //     };

  createDraft = async (req, res, next) => {
    try {
      const result = await this.projectService.createDraftProject(
        req.user.userId,
        req.body,
      );
      return ApiResponse.created(res, result, "Đã lưu bản nháp dự án (Bước 1)");
    } catch (error) {
      next(error);
    }
  };

  updateDraft = async (req, res, next) => {
    try {
      const result = await this.projectService.updateDraftProject(
        req.params.id,
        req.user.userId,
        req.body,
      );
      return ApiResponse.success(
        res,
        result,
        "Đã cập nhật bản nháp dự án (Bước 2)",
      );
    } catch (error) {
      next(error);
    }
  };

  getFeatured = async (req, res, next) => {
    try {
      const result = await this.projectService.getFeaturedProjects();
      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách dự án nổi bật thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getVolunteerNeeded = async (req, res, next) => {
    try {
      const result = await this.projectService.getVolunteerProjects();
      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách dự án cần tình nguyện viên thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getExploreProjects = async (req, res, next) => {
    try {
      const result = await this.projectService.getExploreProjects(req.query);
      return ApiResponse.success(res, result, "Lấy danh sách dự án thành công");
    } catch (error) {
      next(error);
    }
  };

  getDetail = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const userId = req.user?.userId || req.user?.id || null;
      const result = await this.projectService.getProjectDetail(
        projectId,
        userId,
      );
      return ApiResponse.success(res, result, "Lấy chi tiết dự án thành công");
    } catch (error) {
      next(error);
    }
  };

  // Draft detail riêng cho Organizer edit màn create/edit.
  // Không thay thế getDetail public, chỉ tách riêng để tránh 1 endpoint gánh 2 vai.
  getDraftDetail = async (req, res, next) => {
    try {
      const result = await this.projectService.getDraftDetail(
        req.params.id,
        req.user.userId,
      );
      return ApiResponse.success(
        res,
        result,
        "Lấy chi tiết bản nháp dự án thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getWorkspaceStats = async (req, res, next) => {
    try {
      const result = await this.projectService.getWorkspaceStats(
        req.user.userId,
      );
      return ApiResponse.success(
        res,
        result,
        "Lấy thống kê Workspace thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getWorkspaceProjects = async (req, res, next) => {
    try {
      const result = await this.projectService.getWorkspaceProjects(
        req.user.userId,
        req.query,
      );
      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách dự án Workspace thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  submitForApproval = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const organizerId = req.user.userId;

      const result = await this.projectService.submitForApproval(
        projectId,
        organizerId,
      );

      return ApiResponse.success(
        res,
        result,
        "Dự án đã được gửi để Ban quản trị kiểm duyệt thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  reportProject = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const { reason_code, description = "" } = req.body;

      const reportData = {
        report_ref: `REP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        reporter_ref: req.user.userId,
        target_type: "project",
        target_ref: projectId,
        reason_code: reason_code.trim(),
        description: description.trim(),
        evidence_files: [],
        status: "pending",
      };

      const report = await this.reportService.createReport(reportData);

      return ApiResponse.created(res, report, "Báo cáo dự án đã gửi thành công");
    } catch (error) {
      next(error);
    }
  };

  getFeedPosts = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const { limit = 10, cursor = null } = req.query;
      const userId = req.user?.userId || null;
      const result = await this.projectFeedService.getPosts(projectId, { limit, cursor, userId });
      return ApiResponse.success(res, result, "Lấy bài viết dự án thành công");
    } catch (error) {
      next(error);
    }
  };

  createFeedPost = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.userId;
      const content = req.body?.content;

      console.log("[createFeedPost] Received request:", {
        projectId,
        userId,
        content: content?.substring(0, 50),
        hasFile: !!req.file,
        fileInfo: req.file ? {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : null
      });

      let media = null;
      if (req.file) {
        media = {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path
        };
      }

      const result = await this.projectFeedService.createPost(projectId, { userId, content, media });
      console.log("[createFeedPost] Post created successfully:", {
        postId: result._id,
        hasMedia: result.media?.length > 0
      });
      return ApiResponse.created(res, result, "Đăng bài thành công");
    } catch (error) {
      console.error("[createFeedPost] Error:", error.message);
      next(error);
    }
  };

  listFeedComments = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const postId = req.params.postId;
      const { limit = 20, cursor = null } = req.query;
      const userId = req.user?.userId || null;
      const result = await this.projectFeedService.listComments(projectId, postId, { limit, cursor, userId });
      return ApiResponse.success(res, result, "Lấy bình luận thành công");
    } catch (error) {
      next(error);
    }
  };

  createFeedComment = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const postId = req.params.postId;
      const userId = req.user.userId;
      const result = await this.projectFeedService.createComment(projectId, postId, { userId, content: req.body?.content });
      return ApiResponse.created(res, result, "Bình luận thành công");
    } catch (error) {
      next(error);
    }
  };

  toggleFeedPostLike = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const postId = req.params.postId;
      const userId = req.user.userId;
      const result = await this.projectFeedService.togglePostLike(projectId, postId, userId);
      return ApiResponse.success(res, result, "Cập nhật thả tim thành công");
    } catch (error) {
      next(error);
    }
  };

  toggleFeedCommentLike = async (req, res, next) => {
    try {
      const projectId = req.params.id;
      const commentId = req.params.commentId;
      const userId = req.user.userId;
      const result = await this.projectFeedService.toggleCommentLike(projectId, commentId, userId);
      return ApiResponse.success(res, result, "Cập nhật thả tim thành công");
    } catch (error) {
      next(error);
    }
  };
}

export default ProjectController;