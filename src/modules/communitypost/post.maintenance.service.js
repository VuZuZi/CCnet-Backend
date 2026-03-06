class PostMaintenanceService {
  constructor({ postRepository, redis }) {
    this.postRepository = postRepository;
    this.redis = redis;
  }

  async syncUserProfileToPosts(userId, { fullName, avatar, username }) {
    const start = Date.now();
    console.log(`[Maintenance] Batch sync started for user ${userId}`);
    
    const batchSize = 500;
    
    const updateData = {
      "author.fullName": fullName,
      "author.avatar": avatar,
      "author.username": username
    };

    const processedPosts = await this._processBatchUpdate(
        this.postRepository.getPostsByAuthorCursor(userId), 
        (doc) => ({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: updateData }
            }
        }),
        batchSize,
        true 
    );

    const commentUpdateOpsBuilder = (doc) => ({
        updateOne: {
            filter: { _id: doc._id },
            update: {
                $set: {
                    "latestComments.$[elem].author.fullName": fullName,
                    "latestComments.$[elem].author.avatar": avatar,
                    "latestComments.$[elem].author.username": username
                }
            },
            arrayFilters: [{ "elem.author._id": userId }]
        }
    });

    const processedComments = await this._processBatchUpdate(
        this.postRepository.getPostsWithCommentByAuthorCursor(userId),
        commentUpdateOpsBuilder,
        batchSize,
        true 
    );
    try {
        console.log('[Maintenance] Invalidating NewsFeed caches...');
        if (this.redis.deletePattern) {
             await this.redis.deletePattern('feed:public:*');
        } else {
             await this.redis.del('feed:public:10:start');
             await this.redis.del('feed:public:10:null');
        }
    } catch (e) {
        console.error('[Maintenance] Failed to clear feed cache:', e);
    }

    const duration = Date.now() - start;
    console.log(`[Maintenance] Sync completed in ${duration}ms.`);

    return { processedPosts, processedComments, duration };
  }

  async _processBatchUpdate(cursor, opBuilder, batchSize, shouldClearCache = false) {
    let bulkOps = [];
    let affectedIds = []; 
    let count = 0;

    for await (const doc of cursor) {
      bulkOps.push(opBuilder(doc));
      if (shouldClearCache) affectedIds.push(doc._id.toString());

      if (bulkOps.length >= batchSize) {
        await this._executeBatch(bulkOps, affectedIds);
        count += bulkOps.length;
        bulkOps = [];
        affectedIds = [];
        await new Promise(r => setTimeout(r, 20)); 
      }
    }

    if (bulkOps.length > 0) {
      await this._executeBatch(bulkOps, affectedIds);
      count += bulkOps.length;
    }
    
    return count;
  }

  async _executeBatch(ops, idsToInvalidate) {
      await this.postRepository.bulkWrite(ops);

      if (idsToInvalidate && idsToInvalidate.length > 0) {
          const keys = idsToInvalidate.map(id => `post:${id}`);
          this.redis.del(keys).catch(err => 
              console.error('[Maintenance] Cache clear error:', err)
          );
      }
  }
}

export default PostMaintenanceService;