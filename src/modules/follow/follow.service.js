import AppError from "../../core/AppError.js";
import { DOMAIN_EVENTS } from "../notification/constants/notification.events.js";

class FollowService {
  constructor({
    followRepository,
    userRepository,
    projectRepository,
    jobQueue,
    eventBus,
  }) {
    Object.assign(this, {
      followRepository,
      userRepository,
      projectRepository,
      jobQueue,
      eventBus,
    });
  }

  async _ensureUserExists(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  async _ensureProjectExists(projectId) {
    if (!this.projectRepository) {
      throw new AppError("Project repository is not available", 500);
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new AppError("Project not found", 404);
    return project;
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

  async _enqueueProjectCounterUpdate(action, followerId, projectId) {
    try {
      const jobName =
        action === "follow"
          ? "increment-project-follower"
          : "decrement-project-follower";

      await this.jobQueue.addJob("project-maintenance", jobName, {
        followerId,
        projectId,
        action,
      });
    } catch (error) {
      console.error(
        `[CRITICAL][FollowService] Failed to enqueue project ${action} update: ${error.message}`,
      );
    }
  }

  async _emitFollowCreatedEvent({ follower, followingUser, followId }) {
    if (!this.eventBus || typeof this.eventBus.emit !== "function") return;

    try {
      await this.eventBus.emit(DOMAIN_EVENTS.FOLLOW_CREATED, {
        actorId: follower._id,
        actorName: follower.fullName,
        actorAvatar: follower.avatar || "",
        followId,
        targetUserId: followingUser._id,
      });
    } catch (error) {
      console.error("[FollowService] Failed to emit follow.created:", error.message);
    }
  }

  async followUser(followerId, followingId) {
    this._checkSelfAction(followerId, followingId, "follow");

    const [follower, followingUser] = await Promise.all([
      this._ensureUserExists(followerId),
      this._ensureUserExists(followingId),
    ]);

    let createdFollow = null;

    try {
      createdFollow = await this.followRepository.create(followerId, followingId);
    } catch (e) {
      if (e?.code === 11000) return { isFollowing: true };
      throw e;
    }

    this._enqueueCounterUpdate("follow", followerId, followingId);

    await this._emitFollowCreatedEvent({
      follower,
      followingUser,
      followId: createdFollow?._id || null,
    });

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
    if (String(followerId) === String(followingId)) {
      return { isFollowing: false };
    }

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

  async toggleProjectFollow(userId, projectId) {
    await this._ensureProjectExists(projectId);

    const isFollowing = await this.followRepository.existsProjectFollow(
      userId,
      projectId,
    );

    if (isFollowing) {
      await this.followRepository.deleteProjectFollow(userId, projectId);
      this._enqueueProjectCounterUpdate("unfollow", userId, projectId);
      return { isFollowing: false };
    }

    await this.followRepository.createProjectFollow(userId, projectId);
    this._enqueueProjectCounterUpdate("follow", userId, projectId);
    return { isFollowing: true };
  }
}

export default FollowService;