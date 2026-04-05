import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";

class ProjectController {
  constructor({ projectService }) {
    this.projectService = projectService;
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
}

export default ProjectController;
