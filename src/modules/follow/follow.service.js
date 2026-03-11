import AppError from '../../core/AppError.js';

class FollowService {
  constructor({ followRepository, userRepository, jobQueue }) {
    this.followRepository = followRepository;
    this.userRepository = userRepository; 
    this.jobQueue = jobQueue; 
  }

  async _ensureUserExists(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

 async followUser(followerId, followingId) {
    if (String(followerId) === String(followingId)) {
      throw new AppError('Cannot follow yourself', 400);
    }

    await this._ensureUserExists(followingId);

    try {
      await this.followRepository.create(followerId, followingId);
    } catch (e) {
      if (e?.code === 11000) return { isFollowing: true }; 
      throw e; 
    }

    try {
      await this.jobQueue.addJob('follow-updates', 'increment-counter', {
        followerId,
        followingId,
        action: 'follow'
      });
    } catch (queueError) {
      console.error(`[CRITICAL][FollowService] Failed to enqueue counter update: ${queueError.message}`);
    }

    return { isFollowing: true };
  }

  async unfollowUser(followerId, followingId) {
    if (String(followerId) === String(followingId)) {
       throw new AppError('Cannot unfollow yourself', 400);
    }

    const result = await this.followRepository.delete(followerId, followingId);

    if (result.deletedCount > 0) {
      await this.jobQueue.addJob('follow-updates', 'decrement-counter', {
        followerId,
        followingId,
        action: 'unfollow'
      });
    }

    return { isFollowing: false };
  }

  async statusUser(followerId, followingId) {
    if (String(followerId) === String(followingId)) return { isFollowing: false };
    const isFollowing = await this.followRepository.exists(followerId, followingId);
    return { isFollowing };
  }

  async statsUser(userId) {
    const user = await this._ensureUserExists(userId);
    
    return { 
      followers: user.followersCount || 0, 
      following: user.followingCount || 0 
    };
  }

  async getMyFollowing(userId, limit, cursor) {
    const rows = await this.followRepository.findFollowingUsers(userId, limit, cursor);

    const users = rows
      .map((r) => r?.followingId)
      .filter(Boolean)
      .map((u) => ({
        id: String(u._id),
        fullName: u.fullName || '',
        email: u.email || '',
        avatar: u.avatar || '',
      }));

    const nextCursor = rows.length === limit ? rows[rows.length - 1]._id : null;

    return { 
      users, 
      nextCursor, 
      hasMore: !!nextCursor 
    };
  }
}

export default FollowService;