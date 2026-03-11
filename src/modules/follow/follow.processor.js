class FollowProcessor {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  getProcessor() {
    return async (job) => {
      const { followerId, followingId, action } = job.data;
      const isFollow = action === 'follow';

      try {
        console.log(`[FollowProcessor] Processing ${action} for Follower: ${followerId} -> Following: ${followingId}`);

        await this.userRepository.updateCounters(followerId, {
          followingCount: isFollow ? 1 : -1
        });

        await this.userRepository.updateCounters(followingId, {
          followersCount: isFollow ? 1 : -1
        });

        return { success: true };
      } catch (error) {
        console.error(`[FollowProcessor] Critical Error processing job ${job.id}:`, error.message);
        throw error; 
      }
    };
  }
}

export default FollowProcessor;