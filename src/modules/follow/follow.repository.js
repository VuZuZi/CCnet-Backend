import Follow from "./follow.model.js";

class FollowRepository {
  async exists(followerId, followingId) {
    const result = await Follow.exists({ followerId, followingId });
    return !!result;
  }

  async create(followerId, followingId) {
    return await Follow.create({ followerId, followingId });
  }

  async delete(followerId, followingId) {
    return await Follow.deleteOne({ followerId, followingId });
  }

  async countFollowers(userId) {
    return await Follow.countDocuments({ followingId: userId });
  }

  async countFollowing(userId) {
    return await Follow.countDocuments({ followerId: userId });
  }
  async findFollowingIds(followerId) {
    const follows = await Follow.find({ followerId })
      .select("followingId")
      .lean()
      .exec();
    return follows.map((f) => f.followingId);
  }
  async findFollowingUsers(followerId, limit = 50, cursor = null) {
    const query = { followerId };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    return await Follow.find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .populate({ path: "followingId", select: "_id fullName email avatar" })
      .lean()
      .exec();
  }
}

export default FollowRepository;
