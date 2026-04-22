import AppError from "../../core/AppError.js";
import { toUserResponse } from "./user.dto.js";
import bcrypt from "bcryptjs";
import sharp from "sharp";

const STAR_TO_POINTS = {
  1: 20,
  2: 40,
  3: 60,
  4: 80,
  5: 100,
};

const COMPLETED_PROJECT_STATUSES = new Set([
  "COMPLETED",
  "COMPLETED_SUCCESSFULLY",
  "COMPLETED_PARTIAL",
]);

const PROFILE_BADGE_CONFIG = {
  HEALTH: {
    key: "HEALTH",
    label: "Y tế & Sức khỏe",
    icon: "heart",
    bgColor: "#E0F2FE",
    textColor: "#1D4ED8",
    borderColor: "#BFDBFE",
  },
  EDUCATION: {
    key: "EDUCATION",
    label: "Giáo dục",
    icon: "graduation-cap",
    bgColor: "#F3E8FF",
    textColor: "#7E22CE",
    borderColor: "#E9D5FF",
  },
  ENVIRONMENT: {
    key: "ENVIRONMENT",
    label: "Môi trường",
    icon: "tree-pine",
    bgColor: "#DCFCE7",
    textColor: "#15803D",
    borderColor: "#BBF7D0",
  },
  EMERGENCY: {
    key: "EMERGENCY",
    label: "Cứu trợ khẩn cấp",
    icon: "life-buoy",
    bgColor: "#FEF2F2",
    textColor: "#DC2626",
    borderColor: "#FECACA",
  },
  CONSTRUCTION: {
    key: "CONSTRUCTION",
    label: "Xây dựng",
    icon: "hammer",
    bgColor: "#FEF3C7",
    textColor: "#B45309",
    borderColor: "#FDE68A",
  },
  DEFAULT: {
    key: "COMMUNITY",
    label: "Hoạt động cộng đồng",
    icon: "award",
    bgColor: "#F8FAFC",
    textColor: "#334155",
    borderColor: "#E2E8F0",
  },
};

const CATEGORY_ALIASES = {
  HEALTH: "HEALTH",
  Y_TE: "HEALTH",
  YT: "HEALTH",
  MEDICAL: "HEALTH",
  HEALTHCARE: "HEALTH",

  EDUCATION: "EDUCATION",
  GIAO_DUC: "EDUCATION",
  EDUCATE: "EDUCATION",

  ENVIRONMENT: "ENVIRONMENT",
  MOI_TRUONG: "ENVIRONMENT",
  ECOLOGY: "ENVIRONMENT",

  EMERGENCY: "EMERGENCY",
  THIEN_TAI: "EMERGENCY",
  DISASTER_RELIEF: "EMERGENCY",
  CUU_TRO_KHAN_CAP: "EMERGENCY",
  RELIEF: "EMERGENCY",

  CONSTRUCTION: "CONSTRUCTION",
  XAY_DUNG: "CONSTRUCTION",
  BUILDING: "CONSTRUCTION",
};

const normalizeLocation = (location) => {
  if (!location || typeof location !== "object") return null;

  const address =
    typeof location.address === "string" ? location.address.trim() : "";
  const coordinates = Array.isArray(location.coordinates)
    ? location.coordinates.map((value) => Number(value))
    : [];

  if (
    location.type !== "Point" ||
    !address ||
    coordinates.length !== 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  return {
    type: "Point",
    address,
    coordinates,
  };
};

class UserService {
  constructor({
    userRepository,
    mediaRepository,
    cloudinaryProvider,
    jobQueue,
    followRepository,
    volunteerReviewRepository,
    projectRepository,
  }) {
    this.userRepository = userRepository;
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.jobQueue = jobQueue;
    this.followRepository = followRepository;
    this.volunteerReviewRepository = volunteerReviewRepository;
    this.projectRepository = projectRepository;
  }

  _normalizeProjectCategory(categoryValue) {
    const raw = String(categoryValue || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");

    return CATEGORY_ALIASES[raw] || raw || "DEFAULT";
  }

  _computeVolunteerImpactMetrics(reviews = []) {
    const validReviews = Array.isArray(reviews)
      ? reviews.filter((review) => {
          const score = Number(review?.score || 0);
          return (
            String(review?.status || "").toUpperCase() === "REVIEWED" &&
            score >= 1 &&
            score <= 5
          );
        })
      : [];

    const completedCount = validReviews.length;

    const trustScore = validReviews.reduce((total, review) => {
      const score = Number(review?.score || 0);
      return total + (STAR_TO_POINTS[score] || 0);
    }, 0);

    const averageRating =
      completedCount > 0
        ? Number(
            (
              validReviews.reduce(
                (total, review) => total + Number(review?.score || 0),
                0
              ) / completedCount
            ).toFixed(1)
          )
        : 0;

    return {
      completedCount,
      averageRating,
      trustScore,
    };
  }

  _buildAchievementBadges(projects = []) {
    const grouped = new Map();

    for (const project of projects) {
      const normalizedCategory = this._normalizeProjectCategory(
        project?.category
      );
      const config =
        PROFILE_BADGE_CONFIG[normalizedCategory] || PROFILE_BADGE_CONFIG.DEFAULT;

      if (grouped.has(config.key)) {
        grouped.get(config.key).count += 1;
        continue;
      }

      grouped.set(config.key, {
        ...config,
        count: 1,
      });
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "vi");
    });
  }

  async _buildVolunteerProfileInsights(userId) {
    const emptyData = {
      impactMetrics: {
        completedCount: 0,
        averageRating: 0,
        trustScore: 0,
      },
      achievementBadges: [],
    };

    if (!this.volunteerReviewRepository) {
      return emptyData;
    }

    const reviewedVolunteerProjects =
      await this.volunteerReviewRepository.findReviewedByVolunteer(userId);

    const impactMetrics =
      this._computeVolunteerImpactMetrics(reviewedVolunteerProjects);

    if (!reviewedVolunteerProjects.length || !this.projectRepository) {
      return {
        impactMetrics,
        achievementBadges: [],
      };
    }

    const reviewedProjectIds = [
      ...new Set(
        reviewedVolunteerProjects
          .map((item) => String(item?.projectId || "").trim())
          .filter(Boolean)
      ),
    ];

    const projects = await Promise.all(
      reviewedProjectIds.map((projectId) =>
        this.projectRepository.findById(projectId)
      )
    );

    const completedProjects = projects.filter(
      (project) =>
        project &&
        COMPLETED_PROJECT_STATUSES.has(
          String(project?.status || "").toUpperCase()
        )
    );

    const achievementBadges = this._buildAchievementBadges(completedProjects);

    return {
      impactMetrics,
      achievementBadges,
    };
  }

  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  async getProfile(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const baseUser = toUserResponse(user);
    const { impactMetrics, achievementBadges } =
      await this._buildVolunteerProfileInsights(user._id);

    return {
      ...baseUser,
      impactMetrics,
      achievementBadges,
    };
  }

  async getUserByEmail(email) {
    return await this.userRepository.findByEmailWithPassword(email);
  }

  async checkEmailExists(email) {
    return await this.userRepository.existsByEmail(email);
  }

  async createUser(userData) {
    const exists = await this.userRepository.existsByEmail(userData.email);
    if (exists) throw new AppError("Email already registered", 409);
    return await this.userRepository.create(userData);
  }

  async updateProfile(userId, updateData) {
    const payload = { ...updateData };

    if ("location" in payload) {
      payload.location = normalizeLocation(payload.location);
    }

    const updatedUser = await this.userRepository.updateById(userId, payload);
    if (!updatedUser) throw new AppError("User not found", 404);

    const baseUser = toUserResponse(updatedUser);
    const { impactMetrics, achievementBadges } =
      await this._buildVolunteerProfileInsights(updatedUser._id);

    return {
      ...baseUser,
      impactMetrics,
      achievementBadges,
    };
  }

  async changePassword(id, currentPassword, newPassword) {
    const user = await this.userRepository.findByIdWithSecurityData(id);
    if (!user) throw new AppError("User not found", 404);
    if (!user.password) {
      throw new AppError(
        "This account is linked to Google. Password change not allowed.",
        400
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new AppError("Current password is incorrect", 400);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await this.userRepository.updateById(id, {
      password: hashedPassword,
    });
    return toUserResponse(updatedUser);
  }

  async resetPasswordDirect(userId, newPassword) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.userRepository.updateById(userId, { password: hashedPassword });
    return true;
  }

  async changeAvatar(userId, file) {
    if (!file) throw new AppError("Please upload an image", 400);

    const sourceData = file.path || file.buffer;

    try {
      const metadata = await sharp(sourceData).metadata();
      if (!["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
        throw new AppError("Invalid image format detected inside file", 400);
      }
    } catch (error) {
      throw new AppError("Corrupted or invalid image file", 400);
    }

    const oldUser = await this.userRepository.findByIdWithSecurityData(userId);
    if (!oldUser) throw new AppError("User not found", 404);

    let uploadResult;
    let newMedia;

    try {
      uploadResult = await this.cloudinaryProvider.uploadImage(
        sourceData,
        `users/${userId}/avatar`
      );

      newMedia = await this.mediaRepository.create({
        originalName: file.originalname,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        mimetype: file.mimetype,
        size: file.size,
        width: uploadResult.width,
        height: uploadResult.height,
        uploadedBy: userId,
        context: "avatar",
      });

      const updatedUser = await this.userRepository.updateById(userId, {
        avatar: newMedia.url,
        avatarPublicId: newMedia.publicId,
      });

      if (oldUser.avatarPublicId) {
        this._cleanupOldAvatar(oldUser.avatarPublicId).catch((err) =>
          console.error(
            `[Background Task] Failed to cleanup old avatar: ${err.message}`
          )
        );
      }

      await this.jobQueue.addJob("user-updates", "sync-profile", {
        userId: updatedUser._id,
        fullName: updatedUser.fullName,
        avatar: updatedUser.avatar,
        username: updatedUser.email.split("@"),
      });

      return toUserResponse(updatedUser);
    } catch (error) {
      console.error("[Avatar Transaction Failed] Rolling back...", error);

      if (uploadResult?.public_id) {
        await this.cloudinaryProvider
          .deleteImage(uploadResult.public_id)
          .catch(() => {});
      }
      if (newMedia?._id) {
        await this.mediaRepository.deleteById(newMedia._id).catch(() => {});
      }

      throw new AppError(
        "Failed to update avatar due to system error. Rolled back.",
        500
      );
    }
  }

  async _cleanupOldAvatar(publicId) {
    await this.cloudinaryProvider.deleteImage(publicId);
    await this.mediaRepository.deleteByPublicId(publicId);
  }

  async _cleanupOldMedia(publicId) {
    await this.cloudinaryProvider.deleteImage(publicId);
    await this.mediaRepository.deleteByPublicId(publicId);
  }

  async getSuggestedUsers(currentUserId, limit) {
    return await this.userRepository.getSuggestedUsers(currentUserId, limit);
  }

  async changeCoverPhoto(userId, file) {
    if (!file) {
      throw new AppError("Please upload an image for cover photo", 400);
    }

    const sourceData = file.path || file.buffer;

    try {
      const metadata = await sharp(sourceData).metadata();
      if (!["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
        throw new AppError("Invalid image format detected inside file", 400);
      }
    } catch (error) {
      throw new AppError("Corrupted or invalid image file", 400);
    }

    const oldUser = await this.userRepository.findByIdWithSecurityData(userId);
    if (!oldUser) throw new AppError("User not found", 404);

    let uploadResult;
    let newMedia;

    try {
      uploadResult = await this.cloudinaryProvider.uploadImage(
        sourceData,
        `users/${userId}/cover`
      );

      newMedia = await this.mediaRepository.create({
        originalName: file.originalname,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        mimetype: file.mimetype,
        size: file.size,
        width: uploadResult.width,
        height: uploadResult.height,
        uploadedBy: userId,
        context: "cover",
      });

      const updatedUser = await this.userRepository.updateById(userId, {
        coverPhoto: newMedia.url,
        coverPhotoPublicId: newMedia.publicId,
      });

      if (oldUser.coverPhotoPublicId) {
        this._cleanupOldMedia(oldUser.coverPhotoPublicId).catch((err) =>
          console.error(
            `[Background Task] Failed to cleanup old cover photo: ${err.message}`
          )
        );
      }

      await this.jobQueue.addJob("user-updates", "sync-profile", {
        userId: updatedUser._id,
        coverPhoto: updatedUser.coverPhoto,
      });

      return toUserResponse(updatedUser);
    } catch (error) {
      console.error("[Cover Photo Transaction Failed] Rolling back...", error);

      if (uploadResult?.public_id) {
        await this.cloudinaryProvider
          .deleteImage(uploadResult.public_id)
          .catch(() => {});
      }
      if (newMedia?._id) {
        await this.mediaRepository.deleteById(newMedia._id).catch(() => {});
      }

      throw new AppError(
        "Failed to update cover photo. System error, rolled back.",
        500
      );
    }
  }
}

export default UserService;