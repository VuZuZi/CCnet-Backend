import AppError from "../../core/AppError.js";

class FollowService {
  constructor({ followRepository, userRepository, jobQueue }) {
    Object.assign(this, { followRepository, userRepository, jobQueue });
  }

  // --- PRIVATE HELPERS ---
  async _ensureUserExists(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  _checkSelfAction(id1, id2, actionName) {
    if (String(id1) === String(id2)) {
      throw new AppError(`Cannot ${actionName} yourself`, 400);
    }
  }

  _formatUser = (u) => {
    if (!u) return null;
    return {
      id: String(u._id),
      fullName: u.fullName || "",
      email: u.email || "",
      avatar: u.avatar || "",
      username: u.username || "",
    };
  };

  async _enqueueCounterUpdate(action, followerId, followingId) {
    try {
      const jobName =
        action === "follow" ? "increment-counter" : "decrement-counter";
      await this.jobQueue.addJob("follow-updates", jobName, {
        followerId,
        followingId,
        action,
      });
    } catch (error) {
      console.error(
        `[CRITICAL][FollowService] Failed to enqueue ${action} update: ${error.message}`,
      );
    }
  }

  // --- MAIN METHODS ---
  async followUser(followerId, followingId) {
    this._checkSelfAction(followerId, followingId, "follow");
    await this._ensureUserExists(followingId);

    try {
      await this.followRepository.create(followerId, followingId);
    } catch (e) {
      if (e?.code === 11000) return { isFollowing: true };
      throw e;
    }

    this._enqueueCounterUpdate("follow", followerId, followingId);
    return { isFollowing: true };
  }

  async unfollowUser(followerId, followingId) {
    this._checkSelfAction(followerId, followingId, "unfollow");

    const result = await this.followRepository.delete(followerId, followingId);

    if (result.deletedCount > 0) {
      this._enqueueCounterUpdate("unfollow", followerId, followingId);
    }

    return { isFollowing: false };
  }

  async statusUser(followerId, followingId) {
    if (String(followerId) === String(followingId))
      return { isFollowing: false };
    const isFollowing = await this.followRepository.exists(
      followerId,
      followingId,
    );
    return { isFollowing };
  }

  async statsUser(userId) {
    const user = await this._ensureUserExists(userId);
    return {
      followers: user.followersCount || 0,
      following: user.followingCount || 0,
    };
  }

  async getMyFollowing(userId, limit, cursor) {
    const rows = await this.followRepository.findFollowingUsers(
      userId,
      limit,
      cursor,
    );

    const users = rows
      .map((r) => this._formatUser(r?.followingId))
      .filter(Boolean);
    const nextCursor = rows.length === limit ? rows[rows.length - 1]._id : null;

    return { users, nextCursor, hasMore: !!nextCursor };
  }

  async getFollowers({ userId, limit }) {
    const rows = await this.followRepository.findFollowers(userId, limit);

    const users = rows
      .map((r) => this._formatUser(r?.followerId))
      .filter(Boolean);

    return { users };
  }
}

export default FollowService;
