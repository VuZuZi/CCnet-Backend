import AppError from "../../../core/AppError.js";
import { MILESTONE_STATUS } from "../project.constant.js";

const toObject = (value) => (value?.toObject ? value.toObject() : value);

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return String(value._id || value.id || value);
  return String(value);
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const buildPagination = (totalItems, currentPage, pageSize) => {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  return {
    totalItems,
    currentPage,
    totalPages,
    hasNextPage: currentPage < totalPages,
  };
};

class ProjectWorkspaceService {
  constructor({
    projectRepository,
    redis,
    followRepository,
  }) {
    this.projectRepository = projectRepository;
    this.redis = redis;
    this.followRepository = followRepository;
  }

  buildWorkspaceProject(project) {
    const normalizedProject = { ...project };
    const milestones = Array.isArray(normalizedProject.milestones)
      ? normalizedProject.milestones
      : [];

    let currentMilestone = null;

    if (milestones.length > 0) {
      const activeIndex = milestones.findIndex(
        (milestone) =>
          milestone.status === MILESTONE_STATUS.PROCESSING ||
          milestone.status === MILESTONE_STATUS.PENDING,
      );

      const selectedIndex =
        activeIndex === -1 ? milestones.length - 1 : activeIndex;
      const selectedMilestone = milestones[selectedIndex];

      if (selectedMilestone) {
        currentMilestone = {
          title: selectedMilestone.title,
          targetAmount: selectedMilestone.targetAmount,
          status: selectedMilestone.status,
          index: selectedIndex + 1,
        };
      }
    }

    delete normalizedProject.milestones;

    return {
      ...normalizedProject,
      currentMilestone,
    };
  }

  async getExploreProjects(queryParams = {}) {
    const safePage = toPositiveInt(queryParams.page, 1);
    const safeLimit = toPositiveInt(queryParams.limit, 9);
    const skip = (safePage - 1) * safeLimit;

    if (skip > 5000) {
      throw new AppError(
        "Truy vấn quá sâu. Vui lòng sử dụng bộ lọc hoặc tìm kiếm để có kết quả chính xác hơn.",
        400,
      );
    }

    const filter = {};
    let textSearch = null;

    if (queryParams.category) {
      filter.category = queryParams.category;
    }

    if (queryParams.location) {
      textSearch = queryParams.location;
    }

    const result = await this.projectRepository.findAllProjects({
      filter,
      skip,
      limit: safeLimit,
      textSearch,
    });

    return {
      projects: result.projects,
      pagination: buildPagination(result.total, safePage, safeLimit),
    };
  }

  async getProjectDetail(projectId, userId = null) {
    const project = await this.projectRepository.findByIdWithDetails(projectId);

    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    const redisKey = `project:${projectId}:views`;
    this.redis.incr(redisKey).catch(() => {});

    let isFollowing = false;
    let isFollowingOrganizer = false;

    if (userId && this.followRepository) {
      isFollowing = await this.followRepository.existsProjectFollow(
        userId,
        projectId,
      );

      const organizerId = project.organizerId?._id || project.organizerId;

      if (organizerId) {
        isFollowingOrganizer = await this.followRepository.exists(
          userId,
          organizerId,
        );
      }
    }

    return {
      ...toObject(project),
      isFollowing,
      isFollowingOrganizer,
    };
  }

  async getDraftDetail(projectId, organizerId) {
    const project = await this.projectRepository.findByIdWithDetails(projectId);

    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    const ownerId = project.organizerId?._id || project.organizerId;

    if (toIdString(ownerId) !== toIdString(organizerId)) {
      throw new AppError("Bạn không có quyền truy cập bản nháp này", 403);
    }

    return project;
  }

  async getWorkspaceStats(organizerId) {
    const stats = await this.projectRepository.getOrganizerStats(organizerId);

    return {
      totalFundsRaised: stats.totalFundsRaised,
      activeProjects: stats.activeProjects,
      pendingApprovalProjects: stats.pendingProjects,
      pendingVolunteers: 0,
    };
  }

  async getWorkspaceProjects(organizerId, queryParams = {}) {
    const safePage = toPositiveInt(queryParams.page, 1);
    const safeLimit = toPositiveInt(queryParams.limit, 10);
    const skip = (safePage - 1) * safeLimit;
    const status = queryParams.status || "ALL";

    const result = await this.projectRepository.findOrganizerProjects({
      organizerId,
      status,
      skip,
      limit: safeLimit,
    });

    return {
      projects: result.projects.map((project) =>
        this.buildWorkspaceProject(project),
      ),
      pagination: buildPagination(result.total, safePage, safeLimit),
    };
  }
}

export default ProjectWorkspaceService;