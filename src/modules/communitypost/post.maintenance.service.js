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

    let processedPosts = 0;
    let processedComments = 0;

    const postCursor = this.postRepository.getPostsByAuthorCursor(userId).addCursorFlag('noCursorTimeout', true);
    
    try {
      processedPosts = await this._processBatchUpdate(
        postCursor, 
        (doc) => ({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: updateData }
            }
        }),
        batchSize,
        true 
      );
    } finally {
      await postCursor.close(); 
    }

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

    const commentCursor = this.postRepository.getPostsWithCommentByAuthorCursor(userId).addCursorFlag('noCursorTimeout', true);
    
    try {
      processedComments = await this._processBatchUpdate(
        commentCursor,
        commentUpdateOpsBuilder,
        batchSize,
        true 
      );
    } finally {
      await commentCursor.close();
    }
    await this._invalidateFeedCache();

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
        
        await new Promise(r => setImmediate(r)); 
      }
    }

    if (bulkOps.length > 0) {
      await this._executeBatch(bulkOps, affectedIds);
      count += bulkOps.length;
    }
    
    return count;
  }

  async _executeBatch(ops, idsToInvalidate) {
    try {
      await this.postRepository.bulkWrite(ops);

      if (idsToInvalidate && idsToInvalidate.length > 0) {
        const keys = idsToInvalidate.map(id => `post:${id}`);
        if (typeof this.redis.unlink === 'function') {
            await this.redis.unlink(keys);
        } else {
            await this.redis.del(keys);
        }
      }
    } catch (error) {
      console.error('[Maintenance] Bulk write failed:', error);
      throw error; 
    }
  }

  async _invalidateFeedCache() {
    console.log('[Maintenance] Invalidating NewsFeed caches non-blocking...');
    try {
      let cursor = '0';
      const pattern = 'feed:public:*';

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
           if (typeof this.redis.unlink === 'function') {
               await this.redis.unlink(keys);
           } else {
               await this.redis.del(keys);
           }
        }
      } while (cursor !== '0');
      
    } catch (e) {
      console.error('[Maintenance] Failed to scan & clear feed cache:', e);
    }
  }
}

export default PostMaintenanceService;