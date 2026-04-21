import ApiResponse from "../../core/Response.js";

const getUserId = (req) => req.user?.userId || req.user?.id || null;

const buildReportRef = () =>
  `REP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildUploadedMedia = (file) => {
  if (!file) return null;

  return {
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
  };
};

class ProjectController {
  constructor({ projectService, projectFeedService, reportService }) {
    this.projectService = projectService;
    this.projectFeedService = projectFeedService;
    this.reportService = reportService;
  }

  createDraft = async (req, res, next) => {
    try {
      const result = await this.projectService.createDraftProject(
        getUserId(req),
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
        getUserId(req),
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
      const userId = getUserId(req);
      const result = await this.projectService.getFeaturedProjects(userId);

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
      const userId = getUserId(req);
      const result = await this.projectService.getExploreProjects(
        req.query,
        userId,
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy danh sách dự án thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getMapProjects = async (req, res, next) => {
    try {
      const userId = getUserId(req);
      const result = await this.projectService.getMapProjects(req.query, userId);

      return ApiResponse.success(
        res,
        result,
        "Lấy dữ liệu bản đồ dự án thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getDetail = async (req, res, next) => {
    try {
      const result = await this.projectService.getProjectDetail(
        req.params.id,
        getUserId(req),
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy chi tiết dự án thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getDraftDetail = async (req, res, next) => {
    try {
      const result = await this.projectService.getDraftDetail(
        req.params.id,
        getUserId(req),
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

  getUpdatingDetail = async (req, res, next) => {
    try {
      const result = await this.projectService.getUpdatingProjectDetail(
        req.params.id,
        getUserId(req),
      );

      return ApiResponse.success(
        res,
        result,
        "Lấy chi tiết dự án đang cập nhật thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  updateUpdatingProject = async (req, res, next) => {
    try {
      const result = await this.projectService.updateUpdatingProject(
        req.params.id,
        getUserId(req),
        req.body,
      );

      return ApiResponse.success(
        res,
        result,
        "Đã cập nhật milestone của dự án",
      );
    } catch (error) {
      next(error);
    }
  };

  confirmUpdatingProject = async (req, res, next) => {
    try {
      const result = await this.projectService.confirmUpdatingProject(
        req.params.id,
        getUserId(req),
      );

      return ApiResponse.success(
        res,
        result,
        "Đã gửi xác nhận cập nhật dự án cho quản trị viên",
      );
    } catch (error) {
      next(error);
    }
  };

  getWorkspaceStats = async (req, res, next) => {
    try {
      const result = await this.projectService.getWorkspaceStats(getUserId(req));

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
        getUserId(req),
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
      const result = await this.projectService.submitForApproval(
        req.params.id,
        getUserId(req),
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
      const report = await this.reportService.createReport({
        report_ref: buildReportRef(),
        reporter_ref: getUserId(req),
        target_type: "project",
        target_ref: req.params.id,
        reason_code: String(req.body?.reason_code || "").trim(),
        description: String(req.body?.description || "").trim(),
        evidence_files: [],
        status: "pending",
      });

      return ApiResponse.created(
        res,
        report,
        "Báo cáo dự án đã gửi thành công",
      );
    } catch (error) {
      next(error);
    }
  };

  getFeedPosts = async (req, res, next) => {
    try {
      const result = await this.projectFeedService.getPosts(req.params.id, {
        limit: req.query?.limit || 10,
        cursor: req.query?.cursor || null,
        userId: getUserId(req),
      });

      return ApiResponse.success(res, result, "Lấy bài viết dự án thành công");
    } catch (error) {
      next(error);
    }
  };

  createFeedPost = async (req, res, next) => {
    try {
      const result = await this.projectFeedService.createPost(req.params.id, {
        userId: getUserId(req),
        content: req.body?.content,
        media: buildUploadedMedia(req.file),
      });

      return ApiResponse.created(res, result, "Đăng bài thành công");
    } catch (error) {
      next(error);
    }
  };

  listFeedComments = async (req, res, next) => {
    try {
      const result = await this.projectFeedService.listComments(
        req.params.id,
        req.params.postId,
        {
          limit: req.query?.limit || 20,
          cursor: req.query?.cursor || null,
          userId: getUserId(req),
        },
      );

      return ApiResponse.success(res, result, "Lấy bình luận thành công");
    } catch (error) {
      next(error);
    }
  };

  createFeedComment = async (req, res, next) => {
    try {
      const result = await this.projectFeedService.createComment(
        req.params.id,
        req.params.postId,
        {
          userId: getUserId(req),
          content: req.body?.content,
        },
      );

      return ApiResponse.created(res, result, "Bình luận thành công");
    } catch (error) {
      next(error);
    }
  };

  toggleFeedPostLike = async (req, res, next) => {
    try {
      const result = await this.projectFeedService.togglePostLike(
        req.params.id,
        req.params.postId,
        getUserId(req),
      );

      return ApiResponse.success(res, result, "Cập nhật thả tim thành công");
    } catch (error) {
      next(error);
    }
  };

  toggleFeedCommentLike = async (req, res, next) => {
    try {
      const result = await this.projectFeedService.toggleCommentLike(
        req.params.id,
        req.params.commentId,
        getUserId(req),
      );

      return ApiResponse.success(res, result, "Cập nhật thả tim thành công");
    } catch (error) {
      next(error);
    }
  };
}

export default ProjectController;
