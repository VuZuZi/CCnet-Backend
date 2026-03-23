import AppError from "../../core/AppError.js";
import { toUserResponse } from "./user.dto.js";
import bcrypt from "bcryptjs";
import sharp from "sharp";

class UserService {
  constructor({
    userRepository,
    mediaRepository,
    cloudinaryProvider,
    jobQueue,
    followRepository,
  }) {
    this.userRepository = userRepository;
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.jobQueue = jobQueue;
    this.followRepository = followRepository;
  }

  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  async getProfile(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    return toUserResponse(user);
  }

  async getUserByEmail(email) {
    return await this.userRepository.findByEmailWithPassword(email);
  }

  async createUser(userData) {
    const exists = await this.userRepository.existsByEmail(userData.email);
    if (exists) throw new AppError("Email already registered", 409);
    return await this.userRepository.create(userData);
  }

  async updateProfile(userId, updateData) {
    const updatedUser = await this.userRepository.updateById(
      userId,
      updateData,
    );
    if (!updatedUser) throw new AppError("User not found", 404);

    return toUserResponse(updatedUser);
  }

  async changePassword(id, currentPassword, newPassword) {
    const user = await this.userRepository.findByIdWithSecurityData(id);
    if (!user) throw new AppError("User not found", 404);
    if (!user.password)
      throw new AppError(
        "This account is linked to Google. Password change not allowed.",
        400,
      );

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new AppError("Current password is incorrect", 400);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await this.userRepository.updateById(id, {
      password: hashedPassword,
    });
    return toUserResponse(updatedUser);
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
        `users/${userId}/avatar`,
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
            `[Background Task] Failed to cleanup old avatar: ${err.message}`,
          ),
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
        500,
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
  async getSuggestedUsers(currentUserId, limit = 5) {
    const followingIds =
      await this.followRepository.findFollowingIds(currentUserId);
    const excludedIds = [...followingIds, currentUserId];

    return await this.userRepository.findSuggestedUsers(excludedIds, limit);
  }

  async changeCoverPhoto(userId, file) {
    if (!file)
      throw new AppError("Please upload an image for cover photo", 400);

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
        `users/${userId}/cover`,
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
            `[Background Task] Failed to cleanup old cover photo: ${err.message}`,
          ),
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
        500,
      );
    }
  }
}

export default UserService;
