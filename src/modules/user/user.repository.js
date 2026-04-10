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
  async findSuggestedUsers(excludedIds, limit = 5) {
    return await User.find({ _id: { $nin: excludedIds } })
      .select("_id fullName username avatar role")
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
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
