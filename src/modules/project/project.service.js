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

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const toBoundNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    disbursementRequestRepository,
    milestoneEvidenceRepository
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
    this.disbursementRequestRepository = disbursementRequestRepository;
    this.milestoneEvidenceRepository = milestoneEvidenceRepository;
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
      project?.financialDetail?.availableBalance ?? project?.currentAmount ?? 0,
    );
    const target = Number(project?.targetAmount || 0);
    if (target <= 0) return 0;
    return current / target;
  }

  _getVolunteerProgress(project) {
    const current = Number(
      project?.stats?.currentVolunteers ?? project?.stats?.volunteerJoined ?? 0,
    );
    const target =
      Number(
        project?.stats?.targetVolunteers ?? project?.stats?.volunteerNeeded ?? 0,
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
      if (daysLeft <= 3 && fundingProgress < 35) score += 20;
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
      if (daysLeft <= 3 && volunteerProgress < 30) score += 20;
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
      user.skills.map((skill) => this._normalizeText(skill)).filter(Boolean),
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
    const organizerId = toIdString(project?.organizerId);
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
    if (urgency.isUrgent) reasons.push("Dự án đang cần hỗ trợ gấp");
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
    const organizerId = toIdString(project?.organizerId);
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
      const organizerId = toIdString(project?.organizerId);
      const key =
        organizerId ||
        `__no_org__:${project?._id?.toString?.() || Math.random()}`;

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
      const organizerId = toIdString(project?.organizerId);
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

  _getClusterGridSize(zoom) {
    if (zoom <= 5) return 1.8;
    if (zoom <= 6) return 1.2;
    if (zoom <= 7) return 0.8;
    if (zoom <= 8) return 0.45;
    return 0.25;
  }

  _buildClusterPayload(projects = [], zoom = 6) {
    const gridSize = this._getClusterGridSize(zoom);
    const clusterMap = new Map();

    for (const project of projects) {
      const coordinates = project?.location?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;

      const [longitude, latitude] = coordinates.map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const latBucket = Math.floor(latitude / gridSize);
      const lngBucket = Math.floor(longitude / gridSize);
      const gridKey = `${latBucket}:${lngBucket}`;

      if (!clusterMap.has(gridKey)) {
        clusterMap.set(gridKey, {
          type: "cluster",
          gridKey,
          latitudeSum: 0,
          longitudeSum: 0,
          count: 0,
          sampleCategory: project?.category || "KHAC",
          sampleTitle: project?.title || "",
          sampleAddress: project?.location?.address || "",
        });
      }

      const cluster = clusterMap.get(gridKey);
      cluster.latitudeSum += latitude;
      cluster.longitudeSum += longitude;
      cluster.count += 1;
    }

    return Array.from(clusterMap.values())
      .map((cluster) => ({
        type: "cluster",
        clusterId: `cluster-${cluster.gridKey}`,
        gridKey: cluster.gridKey,
        latitude: Number((cluster.latitudeSum / cluster.count).toFixed(6)),
        longitude: Number((cluster.longitudeSum / cluster.count).toFixed(6)),
        count: cluster.count,
        sampleCategory: cluster.sampleCategory,
        sampleTitle: cluster.sampleTitle,
        sampleAddress: cluster.sampleAddress,
        expandZoom: Math.min(zoom + 2, 12),
      }))
      .sort((a, b) => b.count - a.count);
  }

  async syncVolunteerOnlyProjectStatus(project) {
    if (!project?._id) return project;
    const shouldTrySync =
      project.projectType === PROJECT_TYPE.VOLUNTEER_ONLY &&
      project.status === PROJECT_STATUS.RECRUITING;
    if (!shouldTrySync) return project;
    const synced =
      await this.projectRepository.syncVolunteerOnlyExecutionStatus(project._id);
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
        (m) =>
          m.status === MILESTONE_STATUS.PROCESSING ||
          m.status === MILESTONE_STATUS.PENDING,
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
    return { ...normalizedProject, currentMilestone };
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
      limits.maxFundingCap !== null
    ) {
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

    if (Array.isArray(mediaArray)) {
      for (const item of mediaArray) {
        if (!item) continue;

        if (item._id) {
          idsToCheck.push(item._id);
        } else if (item.url && item.publicId) {
          newItemsToCheck.push(item);
        }
      }
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
      const existingPublicIdMap = new Map(
        existingMedias.map((m) => [m.publicId, m]),
      );

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
            mimetype: item.mimetype || (item.mediaType === "video" ? "video/mp4" : "image/webp"),
            size: item.size || 0,
            width: item.width || 0,
            height: item.height || 0,
            captureMetadata: {
              source: 'NONE',
              lat: null,
              lng: null,
              location: null
            },
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

  _applyMilestoneSmartDefaults(milestones, fallbackProjectLocation) {
    if (!milestones || !Array.isArray(milestones)) return [];

    return milestones.map((m) => {
      const targetAmt = m.targetAmount || 0;

      const smartPolicy = {
        requireFinancial: targetAmt > 0,
        requireGeoPhotos: targetAmt === 0 ? 1 : 0,
        requireVolunteerLogs: m.evidencePolicy?.requireVolunteerLogs || false,
      };

      return {
        ...m,
        location: m.location || fallbackProjectLocation,
        evidencePolicy: smartPolicy,
      };
    });
  }

  _mergeUpdatingMilestones(existingMilestones = [], incomingMilestones = []) {
    const existingById = new Map(
      (existingMilestones || [])
        .filter((milestone) => milestone?.milestoneId)
        .map((milestone) => [String(milestone.milestoneId), milestone]),
    );

    return (incomingMilestones || []).map((milestone, index) => {
      const matchedExisting =
        existingById.get(String(milestone?.milestoneId || "")) ||
        existingMilestones[index] ||
        null;

      return {
        ...(matchedExisting || {}),
        ...milestone,
        milestoneId:
          milestone?.milestoneId ||
          matchedExisting?.milestoneId ||
          undefined,
        status:
          matchedExisting?.status ||
          milestone?.status ||
          MILESTONE_STATUS.PENDING,
        disbursementRequestId:
          matchedExisting?.disbursementRequestId || null,
        refundSummary:
          matchedExisting?.refundSummary ||
          milestone?.refundSummary ||
          undefined,
      };
    });
  }

  async _getEscrowBackedFundedAmount(project) {
    const fallbackAmount = Number(project?.currentAmount || 0);

    if (project?.projectType !== PROJECT_TYPE.FUNDED) {
      return fallbackAmount;
    }

    if (
      !this.escrowRepository ||
      typeof this.escrowRepository.findByProjectId !== "function"
    ) {
      return fallbackAmount;
    }

    const projectId = project?._id || project?.id;
    if (!projectId) {
      return fallbackAmount;
    }

    const escrow = await this.escrowRepository.findByProjectId(projectId);
    const escrowAmount = Number(escrow?.availableBalance);

    if (!Number.isFinite(escrowAmount)) {
      return fallbackAmount;
    }

    return escrowAmount;
  }

  async _validateUpdatingMilestones(project, milestones = []) {
    if (!Array.isArray(milestones) || milestones.length === 0) {
      throw new AppError("Phải có ít nhất 1 milestone để cập nhật.", 400);
    }

    if (project?.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
      const hasBudgetedMilestone = milestones.some(
        (milestone) => Number(milestone?.targetAmount || 0) > 0,
      );

      if (hasBudgetedMilestone) {
        throw new AppError(
          "Dự án volunteer-only không được gán ngân sách cho milestone.",
          400,
        );
      }

      return true;
    }

    const expectedAmount = await this._getEscrowBackedFundedAmount(project);
    const totalMilestoneAmount = milestones.reduce(
      (sum, milestone) => sum + Number(milestone?.targetAmount || 0),
      0,
    );

    if (totalMilestoneAmount !== expectedAmount) {
      throw new AppError(
        `Tổng tiền milestone (${totalMilestoneAmount.toLocaleString("vi-VN")}đ) phải khớp với số tiền donate thực tế trong escrow (${expectedAmount.toLocaleString("vi-VN")}đ).`,
        400,
      );
    }

    return true;
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
      const issues =
        validationResult.error.issues || validationResult.error.errors;
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
        console.error(
          `[Queue Error] AI Scan failed for ${projectId}:`,
          err.message,
        ),
      );

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

  async getFeaturedProjects(userId = null) {
    const candidates =
      await this.projectRepository.findCandidateFeaturedProjects(24);
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const enrichProject = (project, score = 0, reasons = []) => {
      const decorated = this._decorateProjectUrgency(project);
      return { ...decorated, recommendationMeta: { score, reasons } };
    };

    if (!userId) {
      const scored = candidates
        .map((project) => {
          const score = this._scoreFeaturedProject(project, {});
          const reasons = this._buildFeaturedReasonList(project, {});
          return { project: enrichProject(project, score, reasons), score };
        })
        .sort((a, b) => b.score - a.score);

      const selected =
        scored[0]?.project || enrichProject(candidates[0], 0, []);
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
          return { project: enrichProject(project, score, reasons), score };
        })
        .sort((a, b) => b.score - a.score);

      const selected =
        scored[0]?.project || enrichProject(candidates[0], 0, []);
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
        .map((row) => toIdString(row?.projectId))
        .filter(Boolean),
    );
    const followedOrganizerIds = new Set(
      (followedUsersRaw || [])
        .map((row) => toIdString(row?.followingId))
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
      const organizerId = toIdString(project?.organizerId);
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
        return { project: enrichProject(project, score, reasons), score };
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

  async getExploreProjects(queryParams, userId = null) {
    const safePage = toPositiveInt(queryParams.page, 1);
    const safeLimit = toPositiveInt(queryParams.limit, 10);
    const skip = (safePage - 1) * safeLimit;

    if (skip > 5000) {
      throw new AppError(
        "Truy vấn quá sâu. Vui lòng sử dụng bộ lọc để có kết quả chính xác hơn.",
        400,
      );
    }

    const { category, location, sort, organizerScope = "ALL" } = queryParams;
    let followedOrganizerIds = [];

    if (userId) {
      const followedUsersRaw = await this.followRepository
        ?.findFollowingUsers?.(userId, 200, null)
        .catch(() => []);
      followedOrganizerIds = (followedUsersRaw || [])
        .map((row) => toIdString(row?.followingId))
        .filter(Boolean);
    }

    if (organizerScope === "FOLLOWED" && followedOrganizerIds.length === 0) {
      return {
        projects: [],
        pagination: buildPagination(0, safePage, safeLimit),
      };
    }

    const filter = {};
    let textSearch = null;

    if (category) filter.category = category;
    if (location) textSearch = location;
    if (organizerScope === "FOLLOWED") {
      filter.organizerId = { $in: followedOrganizerIds };
    }

    if (sort === "ending_soon") {
      filter.endDate = { $gt: new Date() };
      filter.status = {
        $in: [PROJECT_STATUS.FUNDING, PROJECT_STATUS.RECRUITING],
      };
    }

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

  async getMapProjects(queryParams = {}, userId = null) {
    const north = toBoundNumber(queryParams.north);
    const south = toBoundNumber(queryParams.south);
    const east = toBoundNumber(queryParams.east);
    const west = toBoundNumber(queryParams.west);
    const zoom = toPositiveInt(queryParams.zoom, 6);
    const {
      category,
      organizerScope = "ALL",
      search = "",
    } = queryParams;

    let followedOrganizerIds = [];

    if (userId) {
      const followedUsersRaw = await this.followRepository
        ?.findFollowingUsers?.(userId, 200, null)
        .catch(() => []);
      followedOrganizerIds = (followedUsersRaw || [])
        .map((row) => toIdString(row?.followingId))
        .filter(Boolean);
    }

    if (organizerScope === "FOLLOWED" && followedOrganizerIds.length === 0) {
      return {
        mode: zoom < 9 ? "cluster" : "project",
        items: [],
        panelProjects: [],
        summary: {
          zoom,
          totalVisible: 0,
          itemCount: 0,
          projectCount: 0,
          clusterCount: 0,
        },
      };
    }

    const filter = {};
    if (category) filter.category = category;
    if (organizerScope === "FOLLOWED") {
      filter.organizerId = { $in: followedOrganizerIds };
    }

    const hasBounds =
      north !== null &&
      south !== null &&
      east !== null &&
      west !== null;

    if (hasBounds) {
      filter.location = {
        $geoWithin: {
          $box: [
            [west, south],
            [east, north],
          ],
        },
      };
    }

    const result = await this.projectRepository.findProjectsForMap({
      filter,
      limit: zoom >= 9 ? 300 : 1200,
      sortType: "newest",
      textSearch: search,
    });

    const syncedProjects = await this.syncVolunteerOnlyProjectsStatus(
      result.projects || [],
    );
    const decoratedProjects = (syncedProjects || []).map((project) =>
      this._decorateProjectUrgency(project),
    );

    const panelProjects = decoratedProjects.slice(0, 24);
    const mode = zoom >= 9 ? "project" : "cluster";

    if (mode === "cluster") {
      const clusters = this._buildClusterPayload(decoratedProjects, zoom);

      return {
        mode,
        items: clusters,
        panelProjects,
        summary: {
          zoom,
          totalVisible: decoratedProjects.length,
          itemCount: clusters.length,
          projectCount: 0,
          clusterCount: clusters.length,
        },
      };
    }

    return {
      mode,
      items: decoratedProjects,
      panelProjects,
      summary: {
        zoom,
        totalVisible: decoratedProjects.length,
        itemCount: decoratedProjects.length,
        projectCount: decoratedProjects.length,
        clusterCount: 0,
      },
    };
  }

  async getProjectDetail(projectId, userId = null) {
    let project = await this.projectRepository.findByIdWithDetails(projectId);
    if (!project) throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);

    if (typeof this.syncVolunteerOnlyProjectStatus === 'function') {
      project = await this.syncVolunteerOnlyProjectStatus(project);
    }

    let escrow = null;
    let evidences = [];
    let requests = [];

    const parallelTasks = [];

    if (this.milestoneEvidenceRepository?.findAllByProject) {
      parallelTasks.push(
        this.milestoneEvidenceRepository.findAllByProject(projectId)
          .then(res => evidences = res)
      );
    }

    if (project.projectType === PROJECT_TYPE.FUNDED) {
      if (this.escrowRepository?.findByProjectId) {
        parallelTasks.push(
          this.escrowRepository.findByProjectId(projectId)
            .then(res => escrow = res)
        );
      }

      if (this.disbursementRequestRepository?.findAllByProject) {
        parallelTasks.push(
          this.disbursementRequestRepository.findAllByProject(projectId)
            .then(res => requests = res)
        );
      }
    }

    if (parallelTasks.length > 0) {
      await Promise.all(parallelTasks);
    }

    if (this.redis && typeof this.redis.incr === 'function') {
      this.redis.incr(`project:${projectId}:views`).catch(() => { });
    }

    const orgId = project.organizerId?._id || project.organizerId;
    let isFollowing = false;
    let isFollowingOrganizer = false;

    if (userId && this.followRepository) {
      const followTasks = [
        this.followRepository.existsProjectFollow(userId, projectId)
      ];
      if (orgId) {
        followTasks.push(this.followRepository.exists(userId, orgId));
      }

      const followResults = await Promise.all(followTasks);
      isFollowing = followResults[0];
      if (followResults.length > 1) isFollowingOrganizer = followResults[1];
    }

    const isOrganizer = userId && String(orgId) === String(userId);

    const safeProjectData = ProjectDTO && typeof ProjectDTO.toOrganizerDetail === "function"
      ? isOrganizer
        ? ProjectDTO.toOrganizerDetail(project, escrow, evidences, requests)
        : ProjectDTO.toPublicDetail(project, escrow, evidences, requests)
      : (typeof project.toObject === 'function' ? project.toObject() : project);

    const decorated = typeof this._decorateProjectUrgency === 'function'
      ? this._decorateProjectUrgency(safeProjectData)
      : safeProjectData;

    if (project.projectType === PROJECT_TYPE.FUNDED) {
      const failedStatuses = ['FAILED_FUNDING', 'CANCELLED_FRAUD', 'CANCELLED_BY_PLATFORM', 'CANCELLED_BY_ORGANIZER'];
      if (failedStatuses.includes(project.status)) {
        decorated.refundBoard = project.refundSummary || {
          isRefunded: false,
          message: "Dự án đã bị hủy/thất bại. Hệ thống đang tiến hành đối soát và hoàn trả tiền 100% về ví cho các Nhà hảo tâm."
        };
      }
    }

    return { ...decorated, isFollowing, isFollowingOrganizer };
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

  async getUpdatingProjectDetail(projectId, organizerId) {
    const project = await this.projectRepository.findByIdWithDetails(projectId);
    if (!project) {
      throw new AppError("Không tìm thấy dự án hoặc dự án đã bị xóa", 404);
    }

    const ownerId = project.organizerId?._id || project.organizerId;
    if (toIdString(ownerId) !== toIdString(organizerId)) {
      throw new AppError("Bạn không có quyền truy cập dự án này", 403);
    }

    if (project.status !== PROJECT_STATUS.UPDATING) {
      throw new AppError("Dự án này hiện không ở trạng thái Updating.", 400);
    }

    const fundedAmountFromEscrow = await this._getEscrowBackedFundedAmount(
      project,
    );

    return {
      ...project,
      fundedAmountFromEscrow,
      financialDetail:
        project?.projectType === PROJECT_TYPE.FUNDED
          ? {
              ...(project?.financialDetail || {}),
              availableBalance: fundedAmountFromEscrow,
            }
          : project?.financialDetail,
    };
  }

  async updateUpdatingProject(projectId, organizerId, updateData = {}) {
    const existingProject = await this.projectRepository.findById(projectId);
    if (!existingProject) {
      throw new AppError("Không tìm thấy dự án", 404);
    }

    if (String(existingProject.organizerId) !== String(organizerId)) {
      throw new AppError("Bạn không có quyền", 403);
    }

    if (existingProject.status !== PROJECT_STATUS.UPDATING) {
      throw new AppError(
        "Chỉ có thể cập nhật milestone khi dự án đang ở trạng thái Updating.",
        400,
      );
    }

    const mergedMilestones = this._mergeUpdatingMilestones(
      existingProject.milestones || [],
      updateData.milestones || [],
    );

    const normalizedMilestones = this._applyMilestoneSmartDefaults(
      mergedMilestones,
      existingProject.location,
    );

    await this._validateUpdatingMilestones(existingProject, normalizedMilestones);

    const updatedProject =
      await this.projectRepository.updateUpdatingProjectAtomic(
        projectId,
        organizerId,
        {
          milestones: normalizedMilestones,
          updateSubmittedAt: null,
          updateSubmittedBy: null,
        },
      );

    if (!updatedProject) {
      throw new AppError("Không thể cập nhật dự án lúc này.", 409);
    }

    return updatedProject;
  }

  async confirmUpdatingProject(projectId, organizerId) {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Không tìm thấy dự án", 404);
    }

    if (String(project.organizerId) !== String(organizerId)) {
      throw new AppError("Bạn không có quyền", 403);
    }

    if (project.status !== PROJECT_STATUS.UPDATING) {
      throw new AppError("Dự án này hiện không ở trạng thái Updating.", 400);
    }

    await this._validateUpdatingMilestones(project, project.milestones || []);

    const updatedProject = await this.projectRepository.updateById(projectId, {
      updateSubmittedAt: new Date(),
      updateSubmittedBy: organizerId,
    });

    const admins = await this.userRepository.findAdmins();
    const adminIds = (admins || [])
      .map((admin) => String(admin?._id || ""))
      .filter(Boolean);

    if (
      adminIds.length > 0 &&
      this.eventBus &&
      typeof this.eventBus.emit === "function"
    ) {
      this.eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
        recipientIds: adminIds,
        actorId: organizerId,
        projectId: updatedProject?._id || projectId,
        projectName: updatedProject?.title || project.title,
        status: PROJECT_STATUS.UPDATING,
        title: "Organizer đã cập nhật dự án",
        message: `Organizer đã cập nhật milestone cho dự án "${updatedProject?.title || project.title}". Vui lòng kiểm tra và cập nhật trạng thái dự án.`,
        actionUrl: `/admin/projects/${updatedProject?._id || projectId}`,
      });
    }

    return updatedProject;
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
    const safePage = toPositiveInt(queryParams.page, 1);
    const safeLimit = toPositiveInt(queryParams.limit, 10);
    const skip = (safePage - 1) * safeLimit;
    const { status = "ALL", sort } = queryParams;

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

    const {
      validMediaIds: validCoverIds,
      newMediaToInsert: newCoverMedia,
    } = await this._processMediaPayload(
      coverPayload,
      organizerId,
      "project_cover",
    );

    const {
      validMediaIds: validDocIds,
      newMediaToInsert: newDocMedia,
    } = await this._processMediaPayload(
      docsPayload,
      organizerId,
      "project_document",
    );

    const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
    const publicIdsToRollback = allNewMediaToInsert.map((m) => m.publicId);

    try {
      const result = await this.transactionManager.runInTransaction(
        async (session) => {
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
                  mediaType: media.mimetype.startsWith("video")
                    ? "video"
                    : "image",
                };
              } else {
                finalDocumentIds.push(media._id.toString());
              }
            });
          }

          if (!finalCoverMediaData && validCoverIds.length > 0) {
            const existingCover = await this.mediaRepository.findById(
              validCoverIds[0],
            );
            if (existingCover) {
              finalCoverMediaData = {
                url: existingCover.url,
                publicId: existingCover.publicId,
                mediaType: existingCover.mimetype.startsWith("video")
                  ? "video"
                  : "image",
              };
            }
          }

          const { coverMedia: _, documents: __, ...otherProjectData } =
            projectData;

          otherProjectData.milestones = this._applyMilestoneSmartDefaults(
            otherProjectData.milestones,
            otherProjectData.location,
          );

          const newProjectData = {
            ...otherProjectData,
            stats: { targetVolunteers, currentVolunteers: 0 },
            organizerId,
            coverMedia: finalCoverMediaData || undefined,
            documents: [...new Set(finalDocumentIds)],
            status: PROJECT_STATUS.DRAFT,
            currentAmount: 0,
            isOverFunded: false,
            isLocked: false,
          };

          const createdProject = await this.projectRepository.create(
            newProjectData,
            session,
          );

          if (projectData.fromHelpRequestId && this.helpRequestRepository) {
            try {
              const linkedHelpRequest =
                await this.helpRequestRepository.findById(
                  projectData.fromHelpRequestId,
                );
              await this.helpRequestRepository.updateById(
                projectData.fromHelpRequestId,
                { linkedProjectId: createdProject._id },
                session,
              );

              if (
                linkedHelpRequest?.requesterId &&
                this.notificationRepository
              ) {
                const organizerUser = await this.userRepository.findById(
                  organizerId,
                );
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
        },
      );

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
    if (!existingProject) {
      throw new AppError("Không tìm thấy bản nháp dự án", 404);
    }

    if (existingProject.organizerId.toString() !== organizerId.toString()) {
      throw new AppError("Bạn không có quyền", 403);
    }

    if (existingProject.status !== PROJECT_STATUS.DRAFT) {
      throw new AppError("Chỉ có thể chỉnh sửa dự án Nháp.", 400);
    }

    let { deletedDocumentIds, coverMedia, documents, ...finalUpdateData } =
      updateData;

    if (
      finalUpdateData.projectType === PROJECT_TYPE.VOLUNTEER_ONLY ||
      (!finalUpdateData.projectType &&
        existingProject.projectType === PROJECT_TYPE.VOLUNTEER_ONLY)
    ) {
      finalUpdateData.targetAmount = 0;
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

    const {
      validMediaIds: validCoverIds,
      newMediaToInsert: newCoverMedia,
    } = await this._processMediaPayload(
      coverPayload,
      organizerId,
      "project_cover",
    );

    const {
      validMediaIds: validDocIds,
      newMediaToInsert: newDocMedia,
    } = await this._processMediaPayload(
      docsPayload,
      organizerId,
      "project_document",
    );

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
                  mediaType: media.mimetype.startsWith("video")
                    ? "video"
                    : "image",
                };
              } else {
                finalDocumentIds.add(media._id.toString());
              }
            });
          }

          if (finalCoverMediaData) {
            finalUpdateData.coverMedia = finalCoverMediaData;
          } else if (validCoverIds.length > 0) {
            const existingCover = await this.mediaRepository.findById(
              validCoverIds[0],
            );
            if (existingCover) {
              finalUpdateData.coverMedia = {
                url: existingCover.url,
                publicId: existingCover.publicId,
                mediaType: existingCover.mimetype.startsWith("video")
                  ? "video"
                  : "image",
              };
            }
          } else if (
            coverMedia &&
            Array.isArray(coverMedia) &&
            coverMedia.length === 0
          ) {
            finalUpdateData.coverMedia = {
              url: null,
              publicId: null,
              mediaType: "image",
            };
          }

          if (existingProject.coverMedia?.publicId) {
            const isChanged =
              finalUpdateData.coverMedia &&
              finalUpdateData.coverMedia.publicId !==
              existingProject.coverMedia.publicId;
            const isDeleted =
              finalUpdateData.coverMedia &&
              finalUpdateData.coverMedia.url === null;
            if (isChanged || isDeleted) {
              oldCloudinaryIdsToClean.push(existingProject.coverMedia.publicId);
            }
          }

          const docsToSave = Array.from(finalDocumentIds);
          finalUpdateData.documents = docsToSave;

          const existingDocIdsStr = (existingProject.documents || []).map((id) =>
            id.toString(),
          );
          const orphanedIds = existingDocIdsStr.filter(
            (id) => !docsToSave.includes(id),
          );

          if (Array.isArray(deletedDocumentIds)) {
            deletedDocumentIds.forEach((id) => {
              if (
                !orphanedIds.includes(id) &&
                existingDocIdsStr.includes(id)
              ) {
                orphanedIds.push(id);
              }
            });
          }

          if (orphanedIds.length > 0) {
            const mediaDocsToDelete =
              await this.mediaRepository.findManyByIdsAndOwner(
                orphanedIds,
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

          const fallbackLocation =
            finalUpdateData.location || existingProject.location;

          if (finalUpdateData.milestones) {
            finalUpdateData.milestones = this._applyMilestoneSmartDefaults(
              finalUpdateData.milestones,
              fallbackLocation,
            );
          }

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
            console.error(
              "[Queue Error] Lỗi đẩy job dọn ảnh cũ:",
              err.message,
            ),
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
            console.error(
              "[Queue Error] Lỗi đẩy job dọn rác rollback:",
              err.message,
            ),
          );
      }

      if (error instanceof AppError) throw error;
      throw new AppError(`Cập nhật dự án thất bại: ${error.message}`, 400);
    }
  }
}

export default ProjectService;
