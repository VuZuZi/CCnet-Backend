import Follow from "./follow.model.js";

class FollowRepository {
  async exists(followerId, followingId) {
    const result = await Follow.exists({ followerId, followingId });
    return Boolean(result);
  }

  async create(followerId, followingId) {
    return Follow.create({ followerId, followingId });
  }

  async delete(followerId, followingId) {
    return Follow.deleteOne({ followerId, followingId });
  }

  async countFollowers(userId) {
    return Follow.countDocuments({ followingId: userId });
  }

  async countFollowing(userId) {
    return Follow.countDocuments({ followerId: userId });
  }

  async findFollowingIds(followerId) {
    const follows = await Follow.find({ followerId })
      .select("followingId")
      .lean()
      .exec();

    return follows.map((item) => item.followingId);
  }

  async findFollowingUsers(followerId, limit = 50, cursor = null) {
    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 50;
    const query = { followerId };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    return Follow.find(query)
      .sort({ _id: -1 })
      .limit(normalizedLimit)
      .populate({
        path: "followingId",
        select: "_id fullName email avatar username",
      })
      .lean()
      .exec();
  }

  async findFollowers(userId, limit = 50, cursor = null) {
    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 50;
    const query = { followingId: userId };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    return Follow.find(query)
      .sort({ _id: -1 })
      .limit(normalizedLimit)
      .populate({
        path: "followerId",
        select: "_id fullName email avatar username",
      })
      .lean()
      .exec();
  }

  async existsProjectFollow(userId, projectId) {
    const result = await Follow.exists({ followerId: userId, projectId });
    return !!result;
  }

  async createProjectFollow(userId, projectId) {
    return await Follow.create({ followerId: userId, projectId });
  }

  async deleteProjectFollow(userId, projectId) {
    return await Follow.deleteOne({ followerId: userId, projectId });
  }
}

export default FollowRepository;