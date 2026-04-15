import AppError from "../../core/AppError.js";
import { PROJECT_STATUS, MILESTONE_STATUS, PROJECT_TYPE } from "./project.constant.js";
import { KYC_TIER_LIMITS } from "../user/kyc.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import { projectCompleteSchema } from "./project.validation.js";

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

  async _enforceKycTierCaps(project, organizerId) {
    const user = await this.userRepository.findById(organizerId);
    if (!user) throw new AppError("Không tìm thấy thông tin Organizer.", 404);

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

    if (limits.maxDurationDays !== null && durationDays > limits.maxDurationDays) {
      throw new AppError(
        `Tier ${tier} chỉ được tạo dự án tối đa ${limits.maxDurationDays} ngày (Dự án của bạn: ${Math.ceil(durationDays)} ngày).`,
        403,
      );
    }

    if (project.projectType === PROJECT_TYPE.FUNDED && limits.maxFundingCap !== null) {
      if (project.targetAmount > limits.maxFundingCap) {
        throw new AppError(
          `Tier ${tier} chỉ được gọi vốn tối đa ${limits.maxFundingCap.toLocaleString("vi-VN")} VND.`,
          403,
        );
      }
    }

    if (limits.maxConcurrentProjects !== null) {
      const stats = await this.projectRepository.getOrganizerStats(organizerId);
      const concurrent = stats.activeProjects + stats.pendingProjects;

      if (concurrent >= limits.maxConcurrentProjects) {
        throw new AppError(
          `Tier ${tier} chỉ được phép chạy song song tối đa ${limits.maxConcurrentProjects} dự án.`,
          403,
        );
      }
    }
  }

  async _processMediaPayload(mediaArray, organizerId, context) {
    const validMediaIds = new Set();
    const newMediaToInsert = [];

    const idsToCheck = [];
    const newItemsToCheck = [];

    for (const item of mediaArray) {
      if (item?._id) idsToCheck.push(item._id);
      else if (item?.publicId && item?.url) newItemsToCheck.push(item);
    }

    if (idsToCheck.length > 0) {
      const ownedMedia = await this.mediaRepository.findManyByIdsAndOwner(
        idsToCheck,
        organizerId,
      );
      ownedMedia.forEach((m) => validMediaIds.add(m._id.toString()));
    }

    if (newItemsToCheck.length > 0) {
      const publicIds = newItemsToCheck.map((m) => m.publicId);
      const existingMedias = await this.mediaRepository.findManyByPublicIds(publicIds);
      const existingPublicIdMap = new Map(existingMedias.map((m) => [m.publicId, m]));

      for (const item of newItemsToCheck) {
        const existing = existingPublicIdMap.get(item.publicId);

        if (existing) {
          if (existing.uploadedBy.toString() === organizerId.toString()) {
            validMediaIds.add(existing._id.toString());
          }
        } else {
          newMediaToInsert.push({
            originalName: item.originalName || "unknown_file",
            url: item.url,
            publicId: item.publicId,
            mimetype:
              item.mimetype ||
              (item.mediaType === "video" ? "video/mp4" : "image/jpeg"),
            size: item.size || 0,
            width: item.width || 0,
            height: item.height || 0,
            uploadedBy: organizerId,
            context,
          });
        }
      }
    }

    return {
      validMediaIds: Array.from(validMediaIds),
      newMediaToInsert,
    };
  }

  async submitForApproval(projectId, organizerId) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new AppError("Không tìm thấy dự án.", 404);

    if (project.organizerId.toString() !== organizerId.toString()) {
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

    const projectObj = project.toObject ? project.toObject() : project;
    const validationResult = projectCompleteSchema.safeParse(projectObj);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || validationResult.error.errors;
      const firstError =
        issues && issues.length > 0 ? issues[0].message : "Dữ liệu không hợp lệ";

      throw new AppError(
        `Dự án chưa đủ điều kiện gửi duyệt: ${firstError}`,
        400,
      );
    }

    await this._enforceKycTierCaps(projectObj, organizerId);

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
      .catch((err) =>
        console.error(`[Queue Error] AI Scan failed for ${projectId}:`, err.message),
      );

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

  async getFeaturedProjects() {
    return await this.projectRepository.findFeaturedProjects(1);
  }

  async getVolunteerProjects() {
    return await this.projectRepository.findVolunteerProjects(4);
  }

  async getExploreProjects(queryParams) {
    const { page = 1, limit = 9, category, location } = queryParams;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 9);
    const skip = (safePage - 1) * safeLimit;

    if (skip > 5000) {
      throw new AppError(
        "Truy vấn quá sâu. Vui lòng sử dụng bộ lọc hoặc tìm kiếm để có kết quả chính xác hơn.",
        400,
      );
    }

    const filter = {};
    let textSearch = null;

    if (category) filter.category = category;
    if (location) textSearch = location;

    const result = await this.projectRepository.findAllProjects({
      filter,
      skip,
      limit: safeLimit,
      textSearch,
    });

    const totalPages = Math.ceil(result.total / safeLimit);

    return {
      projects: result.projects,
      pagination: {
        totalItems: result.total,
        currentPage: safePage,
        totalPages,
        hasNextPage: safePage < totalPages,
      },
    };
  }

  async getProjectDetail(projectId, userId = null) {
    const project = await this.projectRepository.findByIdWithDetails(projectId);
    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    const redisKey = `project:${projectId}:views`;
    this.redis
      .incr(redisKey)
      .catch((err) => console.error("[Redis Error]:", err.message));

    let isFollowing = false;
    let isFollowingOrganizer = false;

    if (userId && this.followRepository) {
      isFollowing = await this.followRepository.existsProjectFollow(userId, projectId);

      const orgId = project.organizerId?._id || project.organizerId;
      if (orgId) {
        isFollowingOrganizer = await this.followRepository.exists(userId, orgId);
      }
    }

    const projectData = project.toObject ? project.toObject() : project;
    return { ...projectData, isFollowing, isFollowingOrganizer };
  }

  // Draft detail riêng cho màn Organizer edit.
  // Giữ nguyên getDetail public, chỉ bổ sung thêm nhánh private để tách vai trò rõ ràng hơn.
  async getDraftDetail(projectId, organizerId) {
    const project = await this.projectRepository.findByIdWithDetails(projectId);

    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    const ownerId = project.organizerId?._id || project.organizerId;
    if (String(ownerId) !== String(organizerId)) {
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

  async getWorkspaceProjects(organizerId, queryParams) {
    const { page = 1, limit = 10, status = "ALL" } = queryParams;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const skip = (safePage - 1) * safeLimit;

    const result = await this.projectRepository.findOrganizerProjects({
      organizerId,
      status,
      skip,
      limit: safeLimit,
    });

    const formattedProjects = result.projects.map((project) => {
      let currentMilestone = null;
      let milestoneIndex = 0;

      if (project.milestones && project.milestones.length > 0) {
        const activeIndex = project.milestones.findIndex(
          (m) =>
            m.status === MILESTONE_STATUS.PROCESSING ||
            m.status === MILESTONE_STATUS.PENDING,
        );

        if (activeIndex !== -1) {
          currentMilestone = project.milestones[activeIndex];
          milestoneIndex = activeIndex + 1;
        } else {
          currentMilestone = project.milestones[project.milestones.length - 1];
          milestoneIndex = project.milestones.length;
        }
      }

      delete project.milestones;

      return {
        ...project,
        currentMilestone: currentMilestone
          ? {
              title: currentMilestone.title,
              targetAmount: currentMilestone.targetAmount,
              status: currentMilestone.status,
              index: milestoneIndex,
            }
          : null,
      };
    });

    const totalPages = Math.ceil(result.total / safeLimit);

    return {
      projects: formattedProjects,
      pagination: {
        totalItems: result.total,
        currentPage: safePage,
        totalPages,
        hasNextPage: safePage < totalPages,
      },
    };
  }

  async createDraftProject(organizerId, projectData) {
    const coverPayload = Array.isArray(projectData.coverMedia)
      ? projectData.coverMedia
      : projectData.coverMedia
        ? [projectData.coverMedia]
        : [];

    const docsPayload = Array.isArray(projectData.documents)
      ? projectData.documents
      : [];

    let targetVolunteers = 0;
    if (projectData.needsVolunteers && projectData.volunteerRoles?.length > 0) {
      targetVolunteers = projectData.volunteerRoles.reduce(
        (acc, curr) => acc + (Number(curr.quantity) || 0),
        0,
      );
    } else {
      projectData.needsVolunteers = false;
      projectData.volunteerRoles = [];
    }

    const { validMediaIds: validCoverIds, newMediaToInsert: newCoverMedia } =
      await this._processMediaPayload(coverPayload, organizerId, "project_cover");

    const { validMediaIds: validDocIds, newMediaToInsert: newDocMedia } =
      await this._processMediaPayload(docsPayload, organizerId, "project_document");

    const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
    const publicIdsToRollback = allNewMediaToInsert.map((m) => m.publicId);

    try {
      const result = await this.transactionManager.runInTransaction(async (session) => {
        let finalCoverMediaData = null;
        const finalDocumentIds = [...validDocIds];

        if (allNewMediaToInsert.length > 0) {
          const insertedMedia = await this.mediaRepository.createMany(
            allNewMediaToInsert,
            session,
          );

          insertedMedia.forEach((media) => {
            if (media.context === "project_cover") {
              finalCoverMediaData = {
                url: media.url,
                publicId: media.publicId,
                mediaType: media.mimetype.startsWith("video") ? "video" : "image",
              };
            } else {
              finalDocumentIds.push(media._id.toString());
            }
          });
        }

        if (!finalCoverMediaData && validCoverIds.length > 0) {
          const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
          if (existingCover) {
            finalCoverMediaData = {
              url: existingCover.url,
              publicId: existingCover.publicId,
              mediaType: existingCover.mimetype.startsWith("video") ? "video" : "image",
            };
          }
        }

        const { coverMedia: _, documents: __, ...otherProjectData } = projectData;
        const newProjectData = {
          ...otherProjectData,
          stats: { targetVolunteers, currentVolunteers: 0 },
          organizerId,
          coverMedia: finalCoverMediaData || undefined,
          documents: [...new Set(finalDocumentIds)],
          status: PROJECT_STATUS.DRAFT,
          currentAmount: 0,
        };

        const createdProject = await this.projectRepository.create(newProjectData, session);

        if (projectData.fromHelpRequestId && this.helpRequestRepository) {
          try {
            const linkedHelpRequest = await this.helpRequestRepository.findById(
              projectData.fromHelpRequestId,
            );

            await this.helpRequestRepository.updateById(
              projectData.fromHelpRequestId,
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
          } catch (err) {
            console.error(
              "[Project Creation] Failed to link help request:",
              err.message,
            );
          }
        }

        return createdProject;
      });

      return result;
    } catch (error) {
      if (publicIdsToRollback.length > 0) {
        this.jobQueue
          .addJob("project-maintenance", "cleanup-old-media", {
            publicIds: publicIdsToRollback,
          })
          .catch((err) =>
            console.error(
              "[Queue Error] Lỗi đẩy job dọn rác rollback:",
              err.message,
            ),
          );
      }

      throw new AppError(`Tạo dự án thất bại: ${error.message}`, 400);
    }
  }

  async updateDraftProject(projectId, organizerId, updateData) {
    const existingProject = await this.projectRepository.findById(projectId);
    if (!existingProject) throw new AppError("Không tìm thấy bản nháp dự án", 404);
    if (existingProject.organizerId.toString() !== organizerId.toString()) {
      throw new AppError("Bạn không có quyền", 403);
    }
    if (existingProject.status !== PROJECT_STATUS.DRAFT) {
      throw new AppError("Chỉ có thể chỉnh sửa dự án Nháp.", 400);
    }

    let {
      deletedDocumentIds,
      coverMedia,
      documents,
      ...finalUpdateData
    } = updateData;

    if (!Array.isArray(deletedDocumentIds)) {
      deletedDocumentIds = deletedDocumentIds ? [deletedDocumentIds] : [];
    }

    if (
      finalUpdateData.needsVolunteers &&
      finalUpdateData.volunteerRoles?.length > 0
    ) {
      finalUpdateData["stats.targetVolunteers"] =
        finalUpdateData.volunteerRoles.reduce(
          (acc, curr) => acc + (Number(curr.quantity) || 0),
          0,
        );
    } else if (finalUpdateData.needsVolunteers === false) {
      finalUpdateData.volunteerRoles = [];
      finalUpdateData["stats.targetVolunteers"] = 0;
    }

    const coverPayload = Array.isArray(coverMedia)
      ? coverMedia
      : coverMedia
        ? [coverMedia]
        : [];

    const docsPayload = Array.isArray(documents) ? documents : [];

    const { validMediaIds: validCoverIds, newMediaToInsert: newCoverMedia } =
      await this._processMediaPayload(coverPayload, organizerId, "project_cover");

    const { validMediaIds: validDocIds, newMediaToInsert: newDocMedia } =
      await this._processMediaPayload(docsPayload, organizerId, "project_document");

    const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
    const publicIdsToRollback = allNewMediaToInsert.map((m) => m.publicId);

    const oldCloudinaryIdsToClean = [];

    try {
      const updatedProject = await this.transactionManager.runInTransaction(
        async (session) => {
          let finalCoverMediaData = null;
          const finalDocumentIds = new Set(validDocIds);

          if (allNewMediaToInsert.length > 0) {
            const insertedMedia = await this.mediaRepository.createMany(
              allNewMediaToInsert,
              session,
            );

            insertedMedia.forEach((media) => {
              if (media.context === "project_cover") {
                finalCoverMediaData = {
                  url: media.url,
                  publicId: media.publicId,
                  mediaType: media.mimetype.startsWith("video") ? "video" : "image",
                };
              } else {
                finalDocumentIds.add(media._id.toString());
              }
            });
          }

          if (!finalCoverMediaData && validCoverIds.length > 0) {
            const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
            if (existingCover) {
              finalCoverMediaData = {
                url: existingCover.url,
                publicId: existingCover.publicId,
                mediaType: existingCover.mimetype.startsWith("video") ? "video" : "image",
              };
            }
          }

          if (
            finalCoverMediaData &&
            existingProject.coverMedia?.publicId &&
            existingProject.coverMedia.publicId !== finalCoverMediaData.publicId
          ) {
            oldCloudinaryIdsToClean.push(existingProject.coverMedia.publicId);
          }

          if (finalCoverMediaData) {
            finalUpdateData.coverMedia = finalCoverMediaData;
          } else if (validCoverIds.length > 0) {
            const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
            if (existingCover) {
              finalUpdateData.coverMedia = {
                url: existingCover.url,
                publicId: existingCover.publicId,
                mediaType: existingCover.mimetype.startsWith("video") ? "video" : "image",
              };
            }
          }

          if (deletedDocumentIds.length > 0) {
            const mediaDocsToDelete = await this.mediaRepository.findManyByIdsAndOwner(
              deletedDocumentIds,
              organizerId,
              session,
            );

            const actualIdsToDelete = mediaDocsToDelete.map((m) => m._id);
            mediaDocsToDelete.forEach((media) => {
              if (media.publicId) oldCloudinaryIdsToClean.push(media.publicId);
            });

            if (actualIdsToDelete.length > 0) {
              await Promise.all(
                actualIdsToDelete.map((id) =>
                  this.mediaRepository.deleteById(id, session),
                ),
              );
            }
          }

          const existingDocIdsStr = (existingProject.documents || []).map((id) =>
            id.toString(),
          );

          const docsToSave = [
            ...existingDocIdsStr,
            ...Array.from(finalDocumentIds),
          ].filter((id) => !deletedDocumentIds.includes(id));

          finalUpdateData.documents = [...new Set(docsToSave)];

          const resultDoc = await this.projectRepository.updateDraftAtomic(
            projectId,
            organizerId,
            finalUpdateData,
            session,
          );

          if (!resultDoc) {
            throw new AppError(
              "Xung đột hệ thống: Dự án đã đổi trạng thái hoặc bị khoá bởi luồng khác!",
              409,
            );
          }

          return resultDoc;
        },
      );

      if (oldCloudinaryIdsToClean.length > 0) {
        this.jobQueue
          .addJob("project-maintenance", "cleanup-old-media", {
            publicIds: oldCloudinaryIdsToClean,
          })
          .catch((err) =>
            console.error("[Queue Error] Lỗi đẩy job dọn ảnh cũ:", err.message),
          );
      }

      return updatedProject;
    } catch (error) {
      if (publicIdsToRollback.length > 0) {
        this.jobQueue
          .addJob("project-maintenance", "cleanup-old-media", {
            publicIds: publicIdsToRollback,
          })
          .catch((err) =>
            console.error("[Queue Error] Lỗi đẩy job dọn rác rollback:", err.message),
          );
      }

      if (error instanceof AppError) throw error;
      throw new AppError(`Cập nhật dự án thất bại: ${error.message}`, 400);
    }
  }
}

export default ProjectService;