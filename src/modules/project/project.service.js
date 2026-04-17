import AppError from "../../core/AppError.js";
import {
  MILESTONE_STATUS,
  PROJECT_STATUS,
  PROJECT_TYPE,
} from "./project.constant.js";
import { KYC_TIER_LIMITS } from "../user/kyc.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import { projectCompleteSchema } from "./project.validation.js";

const toObject = (value) => (value?.toObject ? value.toObject() : value);

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return String(value._id || value.id || value);
  return String(value);
};

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toUniqueStrings = (values = []) => [...new Set(values.map(String))];

const formatCoverMedia = (media) => ({
  url: media.url,
  publicId: media.publicId,
  mediaType: media.mimetype?.startsWith("video") ? "video" : "image",
});

const buildMediaInsertPayload = (item, organizerId, context) => ({
  originalName: item.originalName || "unknown_file",
  url: item.url,
  publicId: item.publicId,
  mimetype:
    item.mimetype ||
    (item.mediaType === "video" ? "video/mp4" : "image/jpeg"),
  size: Number(item.size || 0),
  width: Number(item.width || 0),
  height: Number(item.height || 0),
  uploadedBy: organizerId,
  context,
});

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

class ProjectService {
  constructor({
    projectRepository,
    mediaRepository,
    cloudinaryProvider,
    jobQueue,
    transactionManager,
    redis,
    followRepository,
    helprequestRepository,
    notificationRepository,
    userRepository,
    eventBus,
  }) {
    this.projectRepository = projectRepository;
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.jobQueue = jobQueue;
    this.transactionManager = transactionManager;
    this.redis = redis;
    this.followRepository = followRepository;
    this.helpRequestRepository = helprequestRepository;
    this.notificationRepository = notificationRepository;
    this.userRepository = userRepository;
    this.eventBus = eventBus;
  }

  _calculateVolunteerStats(projectData = {}) {
    const needsVolunteers = Boolean(projectData.needsVolunteers);
    const volunteerRoles = Array.isArray(projectData.volunteerRoles)
      ? projectData.volunteerRoles
      : [];

    if (!needsVolunteers || volunteerRoles.length === 0) {
      return {
        needsVolunteers: false,
        volunteerRoles: [],
        targetVolunteers: 0,
      };
    }

    const targetVolunteers = volunteerRoles.reduce(
      (sum, role) => sum + Number(role?.quantity || 0),
      0,
    );

    return {
      needsVolunteers: true,
      volunteerRoles,
      targetVolunteers,
    };
  }

  async _linkHelpRequestAfterProjectCreation(
    fromHelpRequestId,
    createdProject,
    organizerId,
    session,
  ) {
    if (!fromHelpRequestId || !this.helpRequestRepository) {
      return;
    }

    try {
      const linkedHelpRequest =
        await this.helpRequestRepository.findById(fromHelpRequestId);

      await this.helpRequestRepository.updateById(
        fromHelpRequestId,
        { linkedProjectId: createdProject._id },
        session,
      );

      if (linkedHelpRequest?.requesterId && this.notificationRepository) {
        const organizerUser = await this.userRepository.findById(organizerId);

        await this.notificationRepository.create({
          recipientId: linkedHelpRequest.requesterId,
          actorId: organizerId,
          type: "help_request_assignment_responded",
          title: `${organizerUser?.fullName || "Organizer"} đã đồng ý host yêu cầu của bạn`,
          message: `Yêu cầu "${linkedHelpRequest.title}" đã được chấp nhận và chuyển thành dự án.`,
          actionUrl: `/projects/${createdProject._id}`,
          metadata: {
            helpRequestId: String(linkedHelpRequest._id),
            projectId: String(createdProject._id),
            organizerId: String(organizerId),
            action: "hosted",
          },
        });
      }
    } catch {}
  }

  async processMediaPayload(mediaArray, organizerId, context) {
    const validMediaIds = new Set();
    const newMediaToInsert = [];
    const normalizedMedia = Array.isArray(mediaArray) ? mediaArray : [];
    const idsToCheck = [];
    const newItemsToCheck = [];

    for (const item of normalizedMedia) {
      if (item?._id) {
        idsToCheck.push(item._id);
        continue;
      }

      if (item?.publicId && item?.url) {
        newItemsToCheck.push(item);
      }
    }

    if (idsToCheck.length > 0) {
      const ownedMedia = await this.mediaRepository.findManyByIdsAndOwner(
        idsToCheck,
        organizerId,
      );

      ownedMedia.forEach((media) => {
        validMediaIds.add(String(media._id));
      });
    }

    if (newItemsToCheck.length === 0) {
      return {
        validMediaIds: Array.from(validMediaIds),
        newMediaToInsert,
      };
    }

    const publicIds = newItemsToCheck.map((item) => item.publicId);
    const existingMedias =
      await this.mediaRepository.findManyByPublicIds(publicIds);

    const existingByPublicId = new Map(
      existingMedias.map((media) => [media.publicId, media]),
    );

    for (const item of newItemsToCheck) {
      const existing = existingByPublicId.get(item.publicId);

      if (existing) {
        if (toIdString(existing.uploadedBy) === toIdString(organizerId)) {
          validMediaIds.add(String(existing._id));
        }
        continue;
      }

      newMediaToInsert.push(
        buildMediaInsertPayload(item, organizerId, context),
      );
    }

    return {
      validMediaIds: Array.from(validMediaIds),
      newMediaToInsert,
    };
  }

  async insertProjectMedia({ coverPayload, docsPayload, organizerId }) {
    const { validMediaIds: validCoverIds, newMediaToInsert: newCoverMedia } =
      await this.processMediaPayload(
        coverPayload,
        organizerId,
        "project_cover",
      );

    const { validMediaIds: validDocIds, newMediaToInsert: newDocMedia } =
      await this.processMediaPayload(
        docsPayload,
        organizerId,
        "project_document",
      );

    const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
    const publicIdsToRollback = allNewMediaToInsert
      .map((media) => media.publicId)
      .filter(Boolean);

    return {
      validCoverIds,
      validDocIds,
      allNewMediaToInsert,
      publicIdsToRollback,
    };
  }

  async resolveCoverMedia({ validCoverIds, insertedMedia }) {
    const insertedCover = insertedMedia.find(
      (media) => media.context === "project_cover",
    );

    if (insertedCover) {
      return formatCoverMedia(insertedCover);
    }

    if (validCoverIds.length === 0) {
      return null;
    }

    const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
    return existingCover ? formatCoverMedia(existingCover) : null;
  }

  async queueMediaCleanup(publicIds = []) {
    const ids = publicIds.filter(Boolean);
    if (ids.length === 0) return;

    this.jobQueue
      .addJob("project-maintenance", "cleanup-old-media", { publicIds: ids })
      .catch(() => {});
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

  async syncVolunteerOnlyProjectStatus(project) {
    if (!project?._id) return project;

    const shouldTrySync =
      project.projectType === PROJECT_TYPE.VOLUNTEER_ONLY &&
      project.status === PROJECT_STATUS.RECRUITING;

    if (!shouldTrySync) {
      return project;
    }

    const synced = await this.projectRepository.syncVolunteerOnlyExecutionStatus(
      project._id,
    );
    return synced || project;
  }

  async syncVolunteerOnlyProjectsStatus(projects = []) {
    return Promise.all(
      projects.map((project) => this.syncVolunteerOnlyProjectStatus(project)),
    );
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

  async getFeaturedProjects() {
    const projects = await this.projectRepository.findFeaturedProjects(1);
    return this.syncVolunteerOnlyProjectsStatus(projects);
  }

  async getVolunteerProjects() {
    const projects = await this.projectRepository.findVolunteerProjects(4);
    return this.syncVolunteerOnlyProjectsStatus(projects);
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

    const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(
      result.projects,
    );

    return {
      projects: syncedProjects,
      pagination: buildPagination(result.total, safePage, safeLimit),
    };
  }

  async getProjectDetail(projectId, userId = null) {
    let project = await this.projectRepository.findByIdWithDetails(projectId);

    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    project = await this.syncVolunteerOnlyProjectStatus(project);

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

    const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(
      result.projects,
    );

    return {
      projects: syncedProjects.map((project) =>
        this.buildWorkspaceProject(project),
      ),
      pagination: buildPagination(result.total, safePage, safeLimit),
    };
  }

  async createDraftProject(organizerId, projectData = {}) {
    const coverPayload = toArray(projectData.coverMedia);
    const docsPayload = toArray(projectData.documents);
    const volunteerStats = this._calculateVolunteerStats(projectData);

    const {
      validCoverIds,
      validDocIds,
      allNewMediaToInsert,
      publicIdsToRollback,
    } = await this.insertProjectMedia({
      coverPayload,
      docsPayload,
      organizerId,
    });

    try {
      return await this.transactionManager.runInTransaction(async (session) => {
        const insertedMedia =
          allNewMediaToInsert.length > 0
            ? await this.mediaRepository.createMany(allNewMediaToInsert, session)
            : [];

        const finalCoverMedia = await this.resolveCoverMedia({
          validCoverIds,
          insertedMedia,
        });

        const finalDocumentIds = toUniqueStrings([
          ...validDocIds,
          ...insertedMedia
            .filter((media) => media.context === "project_document")
            .map((media) => String(media._id)),
        ]);

        const {
          coverMedia: _coverMedia,
          documents: _documents,
          ...restProjectData
        } = projectData;

        const createdProject = await this.projectRepository.create(
          {
            ...restProjectData,
            needsVolunteers: volunteerStats.needsVolunteers,
            volunteerRoles: volunteerStats.volunteerRoles,
            stats: {
              targetVolunteers: volunteerStats.targetVolunteers,
              currentVolunteers: 0,
            },
            organizerId,
            coverMedia: finalCoverMedia || undefined,
            documents: finalDocumentIds,
            status: PROJECT_STATUS.DRAFT,
            currentAmount: 0,
          },
          session,
        );

        await this._linkHelpRequestAfterProjectCreation(
          projectData.fromHelpRequestId,
          createdProject,
          organizerId,
          session,
        );

        return createdProject;
      });
    } catch (error) {
      await this.queueMediaCleanup(publicIdsToRollback);
      throw new AppError(`Tạo dự án thất bại: ${error.message}`, 400);
    }
  }

  async updateDraftProject(projectId, organizerId, updateData = {}) {
    const existingProject = await this.projectRepository.findById(projectId);

    if (!existingProject) {
      throw new AppError("Không tìm thấy bản nháp dự án", 404);
    }

    if (toIdString(existingProject.organizerId) !== toIdString(organizerId)) {
      throw new AppError("Bạn không có quyền", 403);
    }

    if (existingProject.status !== PROJECT_STATUS.DRAFT) {
      throw new AppError("Chỉ có thể chỉnh sửa dự án Nháp.", 400);
    }

    let {
      deletedDocumentIds = [],
      coverMedia,
      documents,
      ...finalUpdateData
    } = updateData;

    deletedDocumentIds = Array.isArray(deletedDocumentIds)
      ? deletedDocumentIds
      : deletedDocumentIds
        ? [deletedDocumentIds]
        : [];

    if (
      "needsVolunteers" in finalUpdateData ||
      "volunteerRoles" in finalUpdateData
    ) {
      const volunteerStats = this._calculateVolunteerStats({
        needsVolunteers:
          "needsVolunteers" in finalUpdateData
            ? finalUpdateData.needsVolunteers
            : existingProject.needsVolunteers,
        volunteerRoles:
          "volunteerRoles" in finalUpdateData
            ? finalUpdateData.volunteerRoles
            : existingProject.volunteerRoles,
      });

      finalUpdateData.needsVolunteers = volunteerStats.needsVolunteers;
      finalUpdateData.volunteerRoles = volunteerStats.volunteerRoles;
      finalUpdateData["stats.targetVolunteers"] =
        volunteerStats.targetVolunteers;
    }

    const coverPayload = toArray(coverMedia);
    const docsPayload = toArray(documents);

    const {
      validCoverIds,
      validDocIds,
      allNewMediaToInsert,
      publicIdsToRollback,
    } = await this.insertProjectMedia({
      coverPayload,
      docsPayload,
      organizerId,
    });

    const oldCloudinaryIdsToClean = [];

    try {
      const updatedProject = await this.transactionManager.runInTransaction(
        async (session) => {
          const insertedMedia =
            allNewMediaToInsert.length > 0
              ? await this.mediaRepository.createMany(
                  allNewMediaToInsert,
                  session,
                )
              : [];

          const resolvedCoverMedia = await this.resolveCoverMedia({
            validCoverIds,
            insertedMedia,
          });

          if (
            resolvedCoverMedia &&
            existingProject.coverMedia?.publicId &&
            existingProject.coverMedia.publicId !== resolvedCoverMedia.publicId
          ) {
            oldCloudinaryIdsToClean.push(existingProject.coverMedia.publicId);
          }

          if (resolvedCoverMedia) {
            finalUpdateData.coverMedia = resolvedCoverMedia;
          }

          if (deletedDocumentIds.length > 0) {
            const mediaDocsToDelete =
              await this.mediaRepository.findManyByIdsAndOwner(
                deletedDocumentIds,
                organizerId,
                session,
              );

            const actualIdsToDelete = mediaDocsToDelete.map((media) => media._id);

            mediaDocsToDelete.forEach((media) => {
              if (media.publicId) {
                oldCloudinaryIdsToClean.push(media.publicId);
              }
            });

            if (actualIdsToDelete.length > 0) {
              await Promise.all(
                actualIdsToDelete.map((id) =>
                  this.mediaRepository.deleteById(id, session),
                ),
              );
            }
          }

          const existingDocIds = (existingProject.documents || []).map(String);
          const insertedDocIds = insertedMedia
            .filter((media) => media.context === "project_document")
            .map((media) => String(media._id));

          finalUpdateData.documents = toUniqueStrings([
            ...existingDocIds,
            ...validDocIds,
            ...insertedDocIds,
          ]).filter((id) => !deletedDocumentIds.includes(id));

          const result = await this.projectRepository.updateDraftAtomic(
            projectId,
            organizerId,
            finalUpdateData,
            session,
          );

          if (!result) {
            throw new AppError(
              "Xung đột hệ thống: Dự án đã đổi trạng thái hoặc bị khoá bởi luồng khác!",
              409,
            );
          }

          return result;
        },
      );

      await this.queueMediaCleanup(oldCloudinaryIdsToClean);
      return updatedProject;
    } catch (error) {
      await this.queueMediaCleanup(publicIdsToRollback);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(`Cập nhật dự án thất bại: ${error.message}`, 400);
    }
  }
}

export default ProjectService;