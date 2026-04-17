import AppError from "../../core/AppError.js";
import {
  PROJECT_STATUS,
  MILESTONE_STATUS,
  PROJECT_TYPE,
} from "./project.constant.js";
import { KYC_TIER_LIMITS } from "../user/kyc.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import { projectCompleteSchema } from "./project.validation.js";
import { ProjectDTO } from "./project.dto.js";

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
    escrowRepository,
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
    volunteerRepository,
  }) {
    this.projectRepository = projectRepository;
    this.escrowRepository = escrowRepository;
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
    this.volunteerRepository = volunteerRepository;
  }

  _normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  _extractKnownCity(value) {
    const normalized = this._normalizeText(value);
    const knownCities = [
      "ha noi",
      "hanoi",
      "ho chi minh",
      "tp hcm",
      "tp.hcm",
      "da nang",
      "can tho",
      "hai phong",
      "nha trang",
      "quang ninh",
      "hue",
    ];

    return knownCities.find((token) => normalized.includes(token)) || "";
  }

  _getFundingProgress(project) {
    const current = Number(
      project?.financialDetail?.availableBalance ??
        project?.currentAmount ??
        0,
    );
    const target = Number(project?.targetAmount || 0);
    if (target <= 0) return 0;
    return current / target;
  }

  _getVolunteerProgress(project) {
    const current = Number(
      project?.stats?.currentVolunteers ??
        project?.stats?.volunteerJoined ??
        0,
    );

    const target =
      Number(
        project?.stats?.targetVolunteers ??
          project?.stats?.volunteerNeeded ??
          0,
      ) ||
      Number(
        Array.isArray(project?.volunteerRoles)
          ? project.volunteerRoles.reduce(
              (sum, role) => sum + Number(role?.quantity || 0),
              0,
            )
          : 0,
      );

    if (target <= 0) return 0;
    return current / target;
  }

  _getDaysUntilEnd(project) {
    if (!project?.endDate) return null;
    const diff = new Date(project.endDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  _computeUrgencySignals(project) {
    const manualUrgent = Boolean(project?.isUrgent);
    const status = String(project?.status || "").toUpperCase();
    const closedStatuses = new Set([
      "COMPLETED",
      "CLOSED",
      "CANCELLED",
      "COMPLETED_SUCCESSFULLY",
      "COMPLETED_PARTIAL",
    ]);

    const isClosed = closedStatuses.has(status);
    const daysLeft = this._getDaysUntilEnd(project);
    const hasExpired = typeof daysLeft === "number" ? daysLeft < 0 : false;
    const isOpen = !isClosed && !hasExpired;
    const category = String(project?.category || "").toUpperCase();
    const isDisasterRelief = category === "THIEN_TAI";
    const fundingProgress = this._getFundingProgress(project) * 100;
    const volunteerProgress = this._getVolunteerProgress(project) * 100;
    const isFundedProject =
      String(project?.projectType || "").toUpperCase() === "FUNDED";
    const needsVolunteers = Boolean(
      project?.needsVolunteers ||
        String(project?.projectType || "").toUpperCase() === "VOLUNTEER_ONLY",
    );

    let score = 0;
    const reasons = [];

    if (!isOpen) {
      return {
        score: 0,
        isUrgent: false,
        manualUrgent,
        autoUrgent: false,
        reasons: [],
        daysLeft,
      };
    }

    if (manualUrgent) {
      score += 100;
      reasons.push("Được đánh dấu khẩn cấp");
    }

    if (isDisasterRelief) {
      score += 35;
      reasons.push("Thuộc nhóm cứu trợ khẩn cấp");
    }

    if (typeof daysLeft === "number") {
      if (daysLeft <= 3) {
        score += 40;
        reasons.push("Sắp hết hạn");
      } else if (daysLeft <= 7) {
        score += 25;
        reasons.push("Thời hạn đang rất gần");
      } else if (daysLeft <= 14) {
        score += 10;
      }
    }

    if (isFundedProject && typeof daysLeft === "number") {
      if (daysLeft <= 7 && fundingProgress < 50) {
        score += 25;
        reasons.push("Tiến độ gây quỹ còn thấp so với thời hạn");
      }

      if (daysLeft <= 3 && fundingProgress < 35) {
        score += 20;
      }

      if (daysLeft <= 7 && fundingProgress >= 70 && fundingProgress < 100) {
        score += 15;
        reasons.push("Gần đạt mục tiêu gây quỹ");
      }
    }

    if (needsVolunteers && typeof daysLeft === "number") {
      if (daysLeft <= 7 && volunteerProgress < 50) {
        score += 20;
        reasons.push("Đang thiếu tình nguyện viên so với thời hạn");
      }

      if (daysLeft <= 3 && volunteerProgress < 30) {
        score += 20;
      }

      if (daysLeft <= 7 && volunteerProgress >= 70 && volunteerProgress < 100) {
        score += 10;
        reasons.push("Đang gần đủ đội ngũ tình nguyện");
      }
    }

    const autoUrgent = score >= 60 && !manualUrgent;
    const isUrgentEffective = manualUrgent || autoUrgent;

    return {
      score,
      isUrgent: isUrgentEffective,
      manualUrgent,
      autoUrgent,
      reasons: reasons.slice(0, 3),
      daysLeft,
    };
  }

  _decorateProjectUrgency(project) {
    if (!project) return project;

    const urgency = this._computeUrgencySignals(project);

    return {
      ...project,
      isUrgentManual: urgency.manualUrgent,
      isUrgentAuto: urgency.autoUrgent,
      isUrgentEffective: urgency.isUrgent,
      isUrgent: urgency.isUrgent,
      urgencyMeta: {
        score: urgency.score,
        reasons: urgency.reasons,
        daysLeft: urgency.daysLeft,
      },
    };
  }

  _extractUserSkillSet(user) {
    if (!Array.isArray(user?.skills)) return new Set();
    return new Set(
      user.skills
        .map((skill) => this._normalizeText(skill))
        .filter(Boolean),
    );
  }

  _getVolunteerSkillMatchScore(project, userSkillSet) {
    if (!project?.needsVolunteers) return 0;
    if (!(userSkillSet instanceof Set) || userSkillSet.size === 0) return 0;

    const requiredSkills = new Set();

    if (Array.isArray(project?.volunteerRoles)) {
      project.volunteerRoles.forEach((role) => {
        if (Array.isArray(role?.skillsRequired)) {
          role.skillsRequired.forEach((skill) => {
            const normalized = this._normalizeText(skill);
            if (normalized) requiredSkills.add(normalized);
          });
        }
      });
    }

    if (!requiredSkills.size) return 4;

    let matchedCount = 0;
    requiredSkills.forEach((skill) => {
      if (userSkillSet.has(skill)) matchedCount += 1;
    });

    if (matchedCount === 0) return 0;
    if (matchedCount >= 3) return 12;
    if (matchedCount === 2) return 8;
    return 5;
  }

  _buildFeaturedReasonList(project, context = {}) {
    const reasons = [];
    const {
      userCity = "",
      supportedCategorySet = new Set(),
      appliedCategorySet = new Set(),
      followedProjectIds = new Set(),
      followedOrganizerIds = new Set(),
      userSkillSet = new Set(),
    } = context;

    const projectId = String(project?._id || "");
    const organizerId =
      project?.organizerId?._id?.toString?.() ||
      project?.organizerId?.toString?.() ||
      "";

    const projectCity = this._extractKnownCity(project?.location?.address || "");
    const fundingProgress = this._getFundingProgress(project);
    const volunteerProgress = this._getVolunteerProgress(project);
    const daysLeft = this._getDaysUntilEnd(project);
    const skillMatchScore = this._getVolunteerSkillMatchScore(
      project,
      userSkillSet,
    );
    const urgency = this._computeUrgencySignals(project);

    if (userCity && projectCity && userCity === projectCity) {
      reasons.push("Gần khu vực của bạn");
    }

    if (supportedCategorySet.has(project?.category)) {
      reasons.push("Phù hợp lĩnh vực bạn từng tham gia");
    } else if (appliedCategorySet.has(project?.category)) {
      reasons.push("Cùng danh mục bạn từng quan tâm");
    }

    if (followedProjectIds.has(projectId)) {
      reasons.push("Bạn đã theo dõi dự án này");
    }

    if (organizerId && followedOrganizerIds.has(organizerId)) {
      reasons.push("Đến từ organizer bạn đang theo dõi");
    }

    if (urgency.isUrgent) {
      reasons.push("Dự án đang cần hỗ trợ gấp");
    }

    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) {
      reasons.push("Sắp hết hạn kêu gọi");
    }

    if (fundingProgress >= 0.85 && fundingProgress < 1) {
      reasons.push("Chỉ còn ít nữa là đạt mục tiêu gây quỹ");
    } else if (fundingProgress >= 0.7 && fundingProgress < 0.85) {
      reasons.push("Đang gần chạm mốc gây quỹ");
    }

    if (project?.needsVolunteers) {
      if (volunteerProgress >= 0.65 && volunteerProgress < 1) {
        reasons.push("Đang gần đủ đội ngũ tình nguyện");
      } else if (volunteerProgress < 0.35) {
        reasons.push("Đang cần thêm tình nguyện viên");
      }

      if (skillMatchScore >= 8) {
        reasons.push("Kỹ năng của bạn khá phù hợp");
      }
    }

    if (project?.stats?.viewCount > 300) {
      reasons.push("Được cộng đồng quan tâm nhiều");
    }

    return reasons.slice(0, 3);
  }

  _scoreFeaturedProject(project, context = {}) {
    const {
      user = null,
      followedProjectIds = new Set(),
      supportedCategorySet = new Set(),
      appliedCategorySet = new Set(),
      followedOrganizerIds = new Set(),
      userCity = "",
      userSkillSet = new Set(),
    } = context;

    let score = 0;
    if (!project?._id) return -Infinity;

    const projectId = String(project?._id || "");
    const organizerId =
      project?.organizerId?._id?.toString?.() ||
      project?.organizerId?.toString?.() ||
      "";
    const projectCity = this._extractKnownCity(project?.location?.address || "");
    const fundingProgress = this._getFundingProgress(project);
    const volunteerProgress = this._getVolunteerProgress(project);
    const daysLeft = this._getDaysUntilEnd(project);
    const followerCount = Number(project?.stats?.followerCount || 0);
    const viewCount = Number(project?.stats?.viewCount || 0);
    const urgency = this._computeUrgencySignals(project);

    if (urgency.isUrgent) score += 18;
    if (project?.coverMedia?.url) score += 8;
    if (project?.summary || project?.description) score += 4;
    if (project?.needsVolunteers) score += 8;
    if (userCity && projectCity && userCity === projectCity) score += 28;
    if (supportedCategorySet.has(project?.category)) score += 22;
    if (appliedCategorySet.has(project?.category)) score += 16;
    if (followedProjectIds.has(projectId)) score += 40;
    if (organizerId && followedOrganizerIds.has(organizerId)) score += 120;

    if (daysLeft !== null) {
      if (daysLeft >= 0 && daysLeft <= 7) score += 12;
      else if (daysLeft <= 14) score += 6;
    }

    if (fundingProgress >= 0.85 && fundingProgress < 1) score += 24;
    else if (fundingProgress >= 0.7 && fundingProgress < 0.85) score += 20;
    else if (fundingProgress >= 0.45 && fundingProgress < 0.7) score += 10;

    if (project?.needsVolunteers) {
      if (volunteerProgress >= 0.6 && volunteerProgress < 1) score += 18;
      else if (volunteerProgress > 0 && volunteerProgress < 0.35) score += 10;

      score += this._getVolunteerSkillMatchScore(project, userSkillSet);
    }

    score += Math.min(followerCount / 10, 8);
    score += Math.min(viewCount / 100, 6);

    if (
      user &&
      Array.isArray(user?.skills) &&
      user.skills.length > 0 &&
      project?.needsVolunteers
    ) {
      score += 2;
    }

    return score;
  }

  _roundRobinByOrganizer(projects = []) {
    const groups = new Map();
    const orderedOrganizerIds = [];

    for (const project of projects) {
      const organizerId =
        project?.organizerId?._id?.toString?.() ||
        project?.organizerId?.toString?.() ||
        "";

      const key =
        organizerId || `__no_org__:${project?._id?.toString?.() || Math.random()}`;

      if (!groups.has(key)) {
        groups.set(key, []);
        orderedOrganizerIds.push(key);
      }

      groups.get(key).push(project);
    }

    const result = [];
    let hasRemaining = true;

    while (hasRemaining) {
      hasRemaining = false;

      for (const organizerId of orderedOrganizerIds) {
        const queue = groups.get(organizerId);

        if (queue && queue.length > 0) {
          result.push(queue.shift());
          hasRemaining = true;
        }
      }
    }

    return result;
  }

  _rebalanceExploreProjects(projects = [], followedOrganizerIds = []) {
    const followedSet = new Set((followedOrganizerIds || []).filter(Boolean));

    const followedProjects = [];
    const otherProjects = [];

    for (const project of projects) {
      const organizerId =
        project?.organizerId?._id?.toString?.() ||
        project?.organizerId?.toString?.() ||
        "";

      if (organizerId && followedSet.has(organizerId)) {
        followedProjects.push(project);
      } else {
        otherProjects.push(project);
      }
    }

    const followedBalanced = this._roundRobinByOrganizer(followedProjects);
    const otherBalanced = this._roundRobinByOrganizer(otherProjects);

    return {
      followedProjects: followedBalanced,
      otherProjects: otherBalanced,
      merged: [...followedBalanced, ...otherBalanced],
    };
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

    return this._decorateProjectUrgency(updatedProject);
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

  async getFeaturedProjects(userId = null) {
    const findCandidateFeaturedProjects =
      this.projectRepository.findCandidateFeaturedProjects?.bind(
        this.projectRepository,
      );

    const candidates = findCandidateFeaturedProjects
      ? await findCandidateFeaturedProjects(24)
      : await this.projectRepository.findFeaturedProjects(1);

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return [];
    }

    const enrichProject = (project, score = 0, reasons = []) => {
      const decorated = this._decorateProjectUrgency(project);

      return {
        ...decorated,
        recommendationMeta: {
          score,
          reasons,
        },
      };
    };

    if (!userId) {
      const scored = candidates
        .map((project) => {
          const score = this._scoreFeaturedProject(project, {});
          const reasons = this._buildFeaturedReasonList(project, {});

          return {
            project: enrichProject(project, score, reasons),
            score,
          };
        })
        .sort((a, b) => b.score - a.score);

      const selected = scored[0]?.project || enrichProject(candidates[0], 0, []);

      return [
        {
          ...selected,
          recommendationMeta: {
            ...(selected.recommendationMeta || {}),
            reasons:
              selected.recommendationMeta?.reasons?.length > 0
                ? selected.recommendationMeta.reasons
                : ["Dự án nổi bật đang được quan tâm"],
          },
        },
      ];
    }

    const user = await this.userRepository.findById(userId).catch(() => null);

    if (!user) {
      const scored = candidates
        .map((project) => {
          const score = this._scoreFeaturedProject(project, {});
          const reasons = this._buildFeaturedReasonList(project, {});

          return {
            project: enrichProject(project, score, reasons),
            score,
          };
        })
        .sort((a, b) => b.score - a.score);

      const selected = scored[0]?.project || enrichProject(candidates[0], 0, []);

      return [
        {
          ...selected,
          recommendationMeta: {
            ...(selected.recommendationMeta || {}),
            reasons:
              selected.recommendationMeta?.reasons?.length > 0
                ? selected.recommendationMeta.reasons
                : ["Dự án nổi bật đang được quan tâm"],
          },
        },
      ];
    }

    const [followedProjectsRaw, volunteerApplicationsRaw, followedUsersRaw] =
      await Promise.all([
        this.followRepository?.findFollowingProjects?.(userId, 100, null).catch(
          () => [],
        ),
        this.volunteerRepository?.findByUserWithProject?.(userId).catch(
          () => [],
        ),
        this.followRepository?.findFollowingUsers?.(userId, 100, null).catch(
          () => [],
        ),
      ]);

    const followedProjectIds = new Set(
      (followedProjectsRaw || [])
        .map(
          (row) =>
            row?.projectId?._id?.toString?.() ||
            row?.projectId?.toString?.(),
        )
        .filter(Boolean),
    );

    const followedOrganizerIds = new Set(
      (followedUsersRaw || [])
        .map(
          (row) =>
            row?.followingId?._id?.toString?.() ||
            row?.followingId?.toString?.(),
        )
        .filter(Boolean),
    );

    const appliedCategorySet = new Set(
      (volunteerApplicationsRaw || [])
        .map((row) => row?.opportunityId?.category)
        .filter(Boolean),
    );

    const supportedCategorySet = new Set(
      (volunteerApplicationsRaw || [])
        .filter((row) => String(row?.status || "").toUpperCase() === "APPROVED")
        .map((row) => row?.opportunityId?.category)
        .filter(Boolean),
    );

    const userCity = this._extractKnownCity(user?.location || "");
    const userSkillSet = this._extractUserSkillSet(user);

    const followedOrganizerProjects = candidates.filter((project) => {
      const organizerId =
        project?.organizerId?._id?.toString?.() ||
        project?.organizerId?.toString?.() ||
        "";

      return organizerId && followedOrganizerIds.has(organizerId);
    });

    const rankingPool =
      followedOrganizerProjects.length > 0
        ? followedOrganizerProjects
        : candidates;

    const scored = rankingPool
      .map((project) => {
        const score = this._scoreFeaturedProject(project, {
          user,
          followedProjectIds,
          supportedCategorySet,
          appliedCategorySet,
          followedOrganizerIds,
          userCity,
          userSkillSet,
        });

        const reasons = this._buildFeaturedReasonList(project, {
          user,
          followedProjectIds,
          supportedCategorySet,
          appliedCategorySet,
          followedOrganizerIds,
          userCity,
          userSkillSet,
        });

        return {
          project: enrichProject(project, score, reasons),
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    return scored.length > 0
      ? [scored[0].project]
      : [enrichProject(candidates[0], 0, [])];
  }

  async getVolunteerProjects() {
    const projects = await this.projectRepository.findVolunteerProjects(4);
    const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(projects);
    return (syncedProjects || []).map((project) =>
      this._decorateProjectUrgency(project),
    );
  }

  async getExploreProjects(queryParams = {}, userId = null) {
    const safePage = toPositiveInt(queryParams.page, 1);
    const safeLimit = toPositiveInt(queryParams.limit, 9);
    const skip = (safePage - 1) * safeLimit;

    if (skip > 5000) {
      throw new AppError(
        "Truy vấn quá sâu. Vui lòng sử dụng bộ lọc để có kết quả chính xác hơn.",
        400,
      );
    }

    const {
      category,
      location,
      sort,
      organizerScope = "ALL",
    } = queryParams;

    let followedOrganizerIds = [];

    if (userId) {
      const followedUsersRaw =
        await this.followRepository?.findFollowingUsers?.(userId, 200, null).catch(
          () => [],
        );

      followedOrganizerIds = (followedUsersRaw || [])
        .map(
          (row) =>
            row?.followingId?._id?.toString?.() ||
            row?.followingId?.toString?.(),
        )
        .filter(Boolean);
    }

    if (organizerScope === "FOLLOWED" && followedOrganizerIds.length === 0) {
      return {
        projects: [],
        pagination: {
          totalItems: 0,
          currentPage: safePage,
          totalPages: 0,
          hasNextPage: false,
        },
      };
    }

    const filter = {};
    let textSearch = null;

    if (category) {
      filter.category = category;
    }

    if (location) {
      textSearch = location;
    }

    if (organizerScope === "FOLLOWED") {
      filter.organizerId = {
        $in: followedOrganizerIds,
      };
    }

    if (sort === "ending_soon") {
      filter.endDate = { $gt: new Date() };
      filter.status = {
        $in: [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING],
      };
    }

    const supportsAdvancedExplore =
      queryParams.sort !== undefined ||
      queryParams.organizerScope !== undefined ||
      typeof this.projectRepository.findAllProjects === "function";

    if (supportsAdvancedExplore) {
      const poolLimit = Math.min(Math.max(safePage * safeLimit * 6, 60), 240);

      const result = await this.projectRepository.findAllProjects({
        filter,
        skip: 0,
        limit: poolLimit,
        sortType: sort,
        textSearch,
      });

      const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(
        result.projects || [],
      );

      const rebalanced = this._rebalanceExploreProjects(
        syncedProjects,
        followedOrganizerIds,
      );

      const rankedProjects =
        organizerScope === "FOLLOWED"
          ? rebalanced.followedProjects
          : rebalanced.merged;

      const pagedProjects = rankedProjects
        .slice(skip, skip + safeLimit)
        .map((project) => this._decorateProjectUrgency(project));

      return {
        projects: pagedProjects,
        pagination: buildPagination(result.total, safePage, safeLimit),
      };
    }

    const result = await this.projectRepository.findAllProjects({
      filter,
      skip,
      limit: safeLimit,
      textSearch,
    });

    const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(
      result.projects || [],
    );

    return {
      projects: syncedProjects.map((project) =>
        this._decorateProjectUrgency(project),
      ),
      pagination: buildPagination(result.total, safePage, safeLimit),
    };
  }

  async getProjectDetail(projectId, userId = null) {
    let project = await this.projectRepository.findByIdWithDetails(projectId);

    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    project = await this.syncVolunteerOnlyProjectStatus(project);

    let escrow = null;
    if (
      project.projectType === PROJECT_TYPE.FUNDED &&
      this.escrowRepository?.findByProjectId
    ) {
      escrow = await this.escrowRepository.findByProjectId(projectId);
    }

    this.redis.incr(`project:${projectId}:views`).catch(() => {});

    const orgId = project.organizerId?._id || project.organizerId;
    let isFollowing = false;
    let isFollowingOrganizer = false;

    if (userId && this.followRepository) {
      [isFollowing, isFollowingOrganizer] = await Promise.all([
        this.followRepository.existsProjectFollow(userId, projectId),
        orgId ? this.followRepository.exists(userId, orgId) : Promise.resolve(false),
      ]);
    }

    const isOrganizer = userId && String(orgId) === String(userId);

    const safeProjectData =
      ProjectDTO && typeof ProjectDTO.toOrganizerDetail === "function" && typeof ProjectDTO.toPublicDetail === "function"
        ? isOrganizer
          ? ProjectDTO.toOrganizerDetail(project, escrow)
          : ProjectDTO.toPublicDetail(project, escrow)
        : toObject(project);

    const decorated = this._decorateProjectUrgency(safeProjectData);

    return {
      ...decorated,
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
    const sort = queryParams.sort;

    const result = await this.projectRepository.findOrganizerProjects({
      organizerId,
      status,
      sortType: sort,
      skip,
      limit: safeLimit,
    });

    const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(
      result.projects || [],
    );

    return {
      projects: syncedProjects.map((project) =>
        this._decorateProjectUrgency(this.buildWorkspaceProject(project)),
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
      (finalUpdateData.projectType || existingProject.projectType) ===
      PROJECT_TYPE.VOLUNTEER_ONLY
    ) {
      finalUpdateData.targetAmount = 0;
      finalUpdateData.mvpAmount = 0;
      finalUpdateData.budgetBreakdown = [];
    }

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

          if (
            Array.isArray(coverMedia) &&
            coverMedia.length === 0 &&
            existingProject.coverMedia?.publicId
          ) {
            finalUpdateData.coverMedia = {
              url: null,
              publicId: null,
              mediaType: "image",
            };
            oldCloudinaryIdsToClean.push(existingProject.coverMedia.publicId);
          } else if (resolvedCoverMedia) {
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