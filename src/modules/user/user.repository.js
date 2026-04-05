import User from "./user.model.js";

class UserRepository {
  async findByEmailWithPassword(email) {
    return await User.findOne({ email }).select("+password").exec();
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
      .select("_id fullName email avatar role location headline about skills phone followersCount followingCount level title createdAt")
      .lean()
      .exec();
  }

  async create(userData) {
    return await User.create(userData);
  }

  async updateById(id, updateData) {
    return await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    )
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
}

export default UserRepository;
