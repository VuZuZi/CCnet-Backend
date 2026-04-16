import AppError from "../../../core/AppError.js";
import { PROJECT_STATUS } from "../project.constant.js";
import ProjectMediaService from "./project-media.service.js";
import ProjectWorkspaceService from "./project-workspace.service.js";
import ProjectSubmissionService from "./project-submission.service.js";

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

    this.projectMediaService = new ProjectMediaService({
      mediaRepository: this.mediaRepository,
      jobQueue: this.jobQueue,
    });

    this.projectWorkspaceService = new ProjectWorkspaceService({
      projectRepository: this.projectRepository,
      redis: this.redis,
      followRepository: this.followRepository,
    });

    this.projectSubmissionService = new ProjectSubmissionService({
      projectRepository: this.projectRepository,
      userRepository: this.userRepository,
      jobQueue: this.jobQueue,
      eventBus: this.eventBus,
    });
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

  async submitForApproval(projectId, organizerId) {
    return this.projectSubmissionService.submitForApproval(projectId, organizerId);
  }

  async getFeaturedProjects() {
    return this.projectRepository.findFeaturedProjects(1);
  }

  async getVolunteerProjects() {
    return this.projectRepository.findVolunteerProjects(4);
  }

  async getExploreProjects(queryParams = {}) {
    return this.projectWorkspaceService.getExploreProjects(queryParams);
  }

  async getProjectDetail(projectId, userId = null) {
    return this.projectWorkspaceService.getProjectDetail(projectId, userId);
  }

  async getDraftDetail(projectId, organizerId) {
    return this.projectWorkspaceService.getDraftDetail(projectId, organizerId);
  }

  async getWorkspaceStats(organizerId) {
    return this.projectWorkspaceService.getWorkspaceStats(organizerId);
  }

  async getWorkspaceProjects(organizerId, queryParams = {}) {
    return this.projectWorkspaceService.getWorkspaceProjects(
      organizerId,
      queryParams,
    );
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
    } = await this.projectMediaService.insertProjectMedia({
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

        const finalCoverMedia =
          await this.projectMediaService.resolveCoverMedia({
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
      await this.projectMediaService.queueMediaCleanup(publicIdsToRollback);
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
    } = await this.projectMediaService.insertProjectMedia({
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

          const resolvedCoverMedia =
            await this.projectMediaService.resolveCoverMedia({
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

      await this.projectMediaService.queueMediaCleanup(oldCloudinaryIdsToClean);
      return updatedProject;
    } catch (error) {
      await this.projectMediaService.queueMediaCleanup(publicIdsToRollback);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(`Cập nhật dự án thất bại: ${error.message}`, 400);
    }
  }
}

export default ProjectService;