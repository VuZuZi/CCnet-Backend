import AppError from "../../../core/AppError.js";
import {
  PROJECT_STATUS,
  PROJECT_TYPE,
} from "../project.constant.js";
import { KYC_TIER_LIMITS } from "../../user/kyc.constant.js";
import { DOMAIN_EVENTS } from "../../../config/notification.js";
import { projectCompleteSchema } from "../project.validation.js";

const toObject = (value) => (value?.toObject ? value.toObject() : value);

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return String(value._id || value.id || value);
  return String(value);
};

class ProjectSubmissionService {
  constructor({
    projectRepository,
    userRepository,
    jobQueue,
    eventBus,
  }) {
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.jobQueue = jobQueue;
    this.eventBus = eventBus;
  }

  async enforceKycTierCaps(project, organizerId) {
    const user = await this.userRepository.findById(organizerId);

    if (!user) {
      throw new AppError("Không tìm thấy thông tin Organizer.", 404);
    }

    const tier = user.kyc?.tier ?? 0;
    const limits = KYC_TIER_LIMITS[tier];

    if (!limits || !limits.canCreateProject) {
      throw new AppError(
        `Tài khoản Tier ${tier} không được phép tạo dự án. Vui lòng nâng cấp KYC.`,
        403,
      );
    }

    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    const durationDays = (end - start) / (1000 * 60 * 60 * 24);

    if (
      limits.maxDurationDays !== null &&
      durationDays > limits.maxDurationDays
    ) {
      throw new AppError(
        `Tier ${tier} chỉ được tạo dự án tối đa ${limits.maxDurationDays} ngày (Dự án của bạn: ${Math.ceil(durationDays)} ngày).`,
        403,
      );
    }

    if (
      project.projectType === PROJECT_TYPE.FUNDED &&
      limits.maxFundingCap !== null &&
      Number(project.targetAmount || 0) > limits.maxFundingCap
    ) {
      throw new AppError(
        `Tier ${tier} chỉ được gọi vốn tối đa ${limits.maxFundingCap.toLocaleString("vi-VN")} VND.`,
        403,
      );
    }

    if (limits.maxConcurrentProjects !== null) {
      const stats = await this.projectRepository.getOrganizerStats(organizerId);
      const concurrent =
        Number(stats.activeProjects || 0) + Number(stats.pendingProjects || 0);

      if (concurrent >= limits.maxConcurrentProjects) {
        throw new AppError(
          `Tier ${tier} chỉ được phép chạy song song tối đa ${limits.maxConcurrentProjects} dự án.`,
          403,
        );
      }
    }
  }

  async submitForApproval(projectId, organizerId) {
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new AppError("Không tìm thấy dự án.", 404);
    }

    if (toIdString(project.organizerId) !== toIdString(organizerId)) {
      throw new AppError(
        "Bạn không có quyền thực hiện hành động này trên dự án của người khác.",
        403,
      );
    }

    if (project.status !== PROJECT_STATUS.DRAFT) {
      throw new AppError(
        "Chỉ có thể Gửi duyệt dự án đang ở trạng thái Bản nháp (DRAFT).",
        400,
      );
    }

    if (!project.startDate || !project.endDate) {
      throw new AppError(
        "Bắt buộc phải cấu hình Ngày bắt đầu và Ngày kết thúc.",
        400,
      );
    }

    const projectData = toObject(project);
    const validationResult = projectCompleteSchema.safeParse(projectData);

    if (!validationResult.success) {
      const issues =
        validationResult.error.issues || validationResult.error.errors || [];
      const firstError =
        issues.length > 0 ? issues[0].message : "Dữ liệu không hợp lệ";

      throw new AppError(
        `Dự án chưa đủ điều kiện gửi duyệt: ${firstError}`,
        400,
      );
    }

    await this.enforceKycTierCaps(projectData, organizerId);

    const updatedProject = await this.projectRepository.transitionStatus(
      projectId,
      PROJECT_STATUS.DRAFT,
      PROJECT_STATUS.PENDING_APPROVAL,
    );

    if (!updatedProject) {
      throw new AppError(
        "Xung đột hệ thống: Dự án đã bị đổi trạng thái bởi một phiên làm việc khác.",
        409,
      );
    }

    this.jobQueue
      .addJob("project-ai-scan", "scan-risk", {
        projectId: updatedProject._id,
        title: updatedProject.title,
        description: updatedProject.description,
      })
      .catch(() => {});

    if (this.eventBus) {
      this.eventBus.emit(DOMAIN_EVENTS.PROJECT_SUBMITTED_FOR_APPROVAL, {
        projectId: updatedProject._id,
        organizerId,
        projectType: updatedProject.projectType,
        title: updatedProject.title,
      });
    }

    return updatedProject;
  }
}

export default ProjectSubmissionService;