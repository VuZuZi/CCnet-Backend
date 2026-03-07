import mongoose from 'mongoose';
import AppError from '../../core/AppError.js';

class FollowService {
  constructor({ followRepository }) {
    this.followRepository = followRepository;
  }

  async _ensureUserExists(userId) {
    const User = mongoose.models.User || mongoose.model('User');
    const ok = await User.exists({ _id: new mongoose.Types.ObjectId(userId) });
    if (!ok) throw new AppError('User not found', 404);
  }

  async followUser(followerId, followingId) {
    if (!followerId) throw new AppError('Unauthorized', 401);
    if (!mongoose.Types.ObjectId.isValid(followingId)) throw new AppError('Invalid userId format', 400);
    if (String(followerId) === String(followingId)) throw new AppError('Cannot follow yourself', 400);

    await this._ensureUserExists(followingId);

    try {
      await this.followRepository.create(followerId, followingId);
    } catch (e) {
      if (e?.code === 11000) return { isFollowing: true };
      throw e;
    }

    return { isFollowing: true };
  }

  async unfollowUser(followerId, followingId) {
    if (!followerId) throw new AppError('Unauthorized', 401);
    if (!mongoose.Types.ObjectId.isValid(followingId)) throw new AppError('Invalid userId format', 400);
    if (String(followerId) === String(followingId)) throw new AppError('Cannot unfollow yourself', 400);

    await this.followRepository.delete(followerId, followingId);
    return { isFollowing: false };
  }

  async statusUser(followerId, followingId) {
    if (!followerId) throw new AppError('Unauthorized', 401);
    if (!mongoose.Types.ObjectId.isValid(followingId)) throw new AppError('Invalid userId format', 400);
    if (String(followerId) === String(followingId)) return { isFollowing: false };

    const ok = await this.followRepository.exists(followerId, followingId);
    return { isFollowing: !!ok };
  }

  async statsUser(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) throw new AppError('Invalid userId format', 400);

    const followers = await this.followRepository.countFollowers(userId);
    const following = await this.followRepository.countFollowing(userId);

    return { followers, following };
  }

  async getMyFollowing(userId, limit = 50) {
    if (!userId) throw new AppError('Unauthorized', 401);

    const rows = await this.followRepository.findFollowingUsers(userId, limit);

    return (rows || [])
      .map((r) => r?.followingId)
      .filter(Boolean)
      .map((u) => ({
        id: String(u._id),
        fullName: u.fullName || '',
        email: u.email || '',
        avatar: u.avatar || '',
      }));
  }
}

export default FollowService;
