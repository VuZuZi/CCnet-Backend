import Follow from "../follow/follow.model.js";
import User from "./user.model.js";
import mongoose from "mongoose";

class UserRepository {
  async findByEmailWithPassword(email) {
    return await User.findOne({ email }).select("+password +googleId").exec();
  }

  async findByEmail(email) {
    return await User.findOne({ email }).lean().exec();
  }

  async findById(id) {
    return await User.findById(id).lean().exec();
  }

  async findByIdWithSecurityData(id) {
    return await User.findById(id)
      .select("+password +googleId +avatarPublicId +coverPhotoPublicId")
      .exec();
  }
  async getSuggestedUsers(currentUserId, limit = 5) {
    try {
      // 1. Khởi tạo mảng chứa các ID cần loại trừ (không gợi ý)
      let excludedIds = [];

      if (currentUserId && mongoose.Types.ObjectId.isValid(currentUserId)) {
        const objectId = new mongoose.Types.ObjectId(currentUserId);

        excludedIds.push(objectId);

        const followingRecords = await Follow.find({
          followerId: objectId,
        }).lean();
        const followingIds = followingRecords.map(
          (record) => record.followingId,
        );
        excludedIds.push(...followingIds);
      }

      // 3. Đưa danh sách loại trừ vào điều kiện Match
      const matchCondition = {
        role: { $in: ["organizer", "Organizer", "ORGANIZER"] },
        isActive: true,
        // Dùng $nin (Not In) để loại bỏ những ID nằm trong mảng excludedIds
        _id: { $nin: excludedIds },
      };

      const suggestedOrganizers = await User.aggregate([
        {
          $match: matchCondition,
        },
        {
          $lookup: {
            from: "projects",
            localField: "_id",
            foreignField: "organizerId",
            as: "projects",
          },
        },
        {
          $addFields: {
            projectCount: { $size: "$projects" },
            kycScore: {
              $switch: {
                branches: [
                  // Dùng $ifNull trực tiếp trong điều kiện so sánh
                  {
                    case: { $eq: [{ $ifNull: ["$kyc.tier", 0] }, 3] },
                    then: 3000,
                  },
                  {
                    case: { $eq: [{ $ifNull: ["$kyc.tier", 0] }, 2] },
                    then: 2000,
                  },
                  {
                    case: { $eq: [{ $ifNull: ["$kyc.tier", 0] }, 1] },
                    then: 1000,
                  },
                ],
                default: 0,
              },
            },
          },
        },

        {
          $sort: {
            totalScore: -1,
            projectCount: -1,
            createdAt: -1,
          },
        },
        {
          $limit: limit,
        },
        {
          $project: {
            _id: 1,
            fullName: 1,
            username: 1,
            avatar: 1,
            role: 1,
            kyc: {
              tier: { $ifNull: ["$kyc.tier", 0] },
            },
            projectCount: 1,
          },
        },
      ]);

      return suggestedOrganizers;
    } catch (error) {
      console.error("Lỗi aggregation Suggested Organizers:", error);
      throw error;
    }
  }

  async findOrganizers({ search = "" } = {}) {
    const query = {
      role: { $in: ["organizer", "Organizer"] },
      isActive: true,
    };

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    return await User.find(query)
      .select(
        "_id fullName email avatar role location headline about skills phone followersCount followingCount level title createdAt",
      )
      .lean()
      .exec();
  }

  async create(userData) {
    return await User.create(userData);
  }

  async updateById(id, updateData, session = null) {
    const options = { new: true, runValidators: true };
    if (session) options.session = session;

    return await User.findByIdAndUpdate(id, { $set: updateData }, options)
      .lean()
      .exec();
  }

  async deleteById(id) {
    return await User.findByIdAndDelete(id).lean().exec();
  }

  async existsByEmail(email) {
    const user = await User.exists({ email });
    return !!user;
  }

  async updateCounters(userId, counters) {
    return await User.findByIdAndUpdate(
      userId,
      { $inc: counters },
      { new: true },
    )
      .lean()
      .exec();
  }

  async findKycExpiringInDays(targetDays, batchSize = 100, lastId = null) {
    const targetDateStart = new Date();
    targetDateStart.setUTCDate(targetDateStart.getUTCDate() + targetDays);
    targetDateStart.setUTCHours(0, 0, 0, 0);

    const targetDateEnd = new Date(targetDateStart);
    targetDateEnd.setUTCDate(targetDateEnd.getUTCDate() + 1);

    const query = {
      "kyc.status": "VERIFIED",
      "kyc.expiresAt": { $gte: targetDateStart, $lt: targetDateEnd },
    };

    if (lastId) {
      query._id = { $gt: lastId };
    }

    return await User.find(query)
      .limit(batchSize)
      .select("_id fullName email kyc.expiresAt")
      .sort({ _id: 1 })
      .lean()
      .exec();
  }

  async updateKycStatusBatch(userIds, status) {
    return await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { "kyc.status": status } },
    ).exec();
  }
  async toggleSavePost(userId, postId) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const savedPostsArray = user.savedPosts || [];
    const isSaved = savedPostsArray.some(
      (savedId) => savedId.toString() === postId.toString(),
    );

    const validPostId = new mongoose.Types.ObjectId(postId);

    if (isSaved) {
      await User.findByIdAndUpdate(userId, {
        $pull: { savedPosts: validPostId },
      });
      return { isSaved: false, action: "unsaved" };
    } else {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { savedPosts: validPostId },
      });
      return { isSaved: true, action: "saved" };
    }
  }
}

export default UserRepository;
