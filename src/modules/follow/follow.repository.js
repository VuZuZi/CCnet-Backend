import mongoose from 'mongoose';
import Follow from './follow.model.js';

class FollowRepository {
  async exists(followerId, followingId) {
    return Follow.exists({
      followerId: new mongoose.Types.ObjectId(followerId),
      followingId: new mongoose.Types.ObjectId(followingId),
    });
  }

  async create(followerId, followingId) {
    return Follow.create({
      followerId: new mongoose.Types.ObjectId(followerId),
      followingId: new mongoose.Types.ObjectId(followingId),
    });
  }

  async delete(followerId, followingId) {
    return Follow.deleteOne({
      followerId: new mongoose.Types.ObjectId(followerId),
      followingId: new mongoose.Types.ObjectId(followingId),
    });
  }

  async countFollowers(userId) {
    return Follow.countDocuments({ followingId: new mongoose.Types.ObjectId(userId) });
  }

  async countFollowing(userId) {
    return Follow.countDocuments({ followerId: new mongoose.Types.ObjectId(userId) });
  }

  async findFollowingUsers(followerId, limit = 50) {
    return Follow.find({ followerId: new mongoose.Types.ObjectId(followerId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: 'followingId', select: '_id fullName email avatar' })
      .lean();
  }
}

export default FollowRepository;
