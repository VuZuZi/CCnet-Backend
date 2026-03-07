import mongoose from "mongoose";
import AppError from "../../core/AppError.js";

class PostService {
    constructor({ postRepository, mediaService, userRepository, redis }) {
        this.postRepository = postRepository;
        this.mediaService = mediaService;
        this.userRepository = userRepository;
        this.redis = redis;
        this.CACHE_TTL_FEED = 60;
        this.CACHE_TTL_POST = 300;
    }

    _extractHashtags(content) {
        if (!content) return [];
        const matches = content.match(/#[a-z0-9_]+/gi) || [];
        return [...new Set(matches.map(tag => tag.toLowerCase().replace('#', '')))];
    }

    _getFeedKey(cursor, limit) {
        return `feed:public:${limit}:${cursor || 'start'}`;
    }

    async createPost({ user, content, files, privacy }) {
        const images = [];
        if (files?.length) {
            const uploadedMedias = await this.mediaService.uploadMultiple(files, user.userId, 'post');
            images.push(...uploadedMedias.map(m => ({
                url: m.url, publicId: m.publicId,
                blurHash: m.blurHash, width: m.width, height: m.height,
                aspectRatio: m.height ? (m.width / m.height) : 1
            })));
        }

        const cleanContent = content?.trim();
        if (!cleanContent && !images.length) {
            throw new AppError("Post content or image required", 400);
        }

        const postData = {
            author: {
                _id: user.userId,
                fullName: user.fullName,
                avatar: user.avatar,
                username: user.username
            },
            content: cleanContent,
            hashtags: this._extractHashtags(cleanContent),
            images,
            privacy: privacy || 'public',
            stats: { likes: 0, comments: 0, shares: 0, views: 0 },
            latestComments: []
        };

        const newPost = await this.postRepository.create(postData);

        // Xóa cache trang đầu. Tối ưu hơn: Push background job (Worker) để xử lý cache.
        const firstPageKey = this._getFeedKey(null, 10);
        await this.redis.del(firstPageKey);

        return newPost;
    }

    async addComment({ postId, user, content }) {
        const session = await mongoose.startSession();
        let newComment;

        try {
            // Dùng withTransaction thống nhất, an toàn hơn và hỗ trợ auto-retry
            await session.withTransaction(async () => {
                newComment = await this.postRepository.createComment({
                    postId, author: user.userId, content
                }, session);

                const commentSnapshot = {
                    _id: newComment._id,
                    content: content,
                    author: {
                        _id: user.userId,
                        fullName: user.fullName,
                        avatar: user.avatar,
                        username: user.username
                    },
                    createdAt: newComment.createdAt || new Date()
                };

                await this.postRepository.pushLatestCommentToPost(postId, commentSnapshot, session);
            });

            // Background invalidate cache
            this.redis.del(`post:${postId}`).catch(e => console.error("[Redis] del error", e));

            return newComment;
        } finally {
            await session.endSession();
        }
    }

    async toggleReaction({ postId, userId, type }) {
        const session = await mongoose.startSession();
        const result = { action: '', type };

        try {
            await session.withTransaction(async () => {
                const existingReaction = await this.postRepository.upsertReaction(
                    { userId, postId, type },
                    session
                );

                // Xử lý cẩn thận đoạn lấy metadata trả về từ upsert của Mongoose
                const isUpdate = existingReaction?.lastErrorObject?.updatedExisting;
                const oldType = existingReaction?.value?.type;

                if (!isUpdate) {
                    await this.postRepository.incrementPostStats(postId, 'likes', 1, session);
                    result.action = 'created';
                } else {
                    if (oldType === type) {
                        await this.postRepository.deleteReaction({ userId, postId }, session);
                        await this.postRepository.incrementPostStats(postId, 'likes', -1, session);
                        result.action = 'removed';
                        result.type = null;
                    } else {
                        result.action = 'switched';
                    }
                }
            });

            this.redis.del(`post:${postId}`).catch(e => console.error("[Redis] del error", e));
            return result;
        } finally {
            await session.endSession();
        }
    }

    async getNewsFeed({ cursor, limit = 10, userId }) {
        const cacheKey = this._getFeedKey(cursor, limit);
        let posts = null;

        try {
            const cachedData = await this.redis.get(cacheKey);
            if (cachedData) posts = JSON.parse(cachedData); // BẮT BUỘC PARSE TỪ REDIS STRING
        } catch (e) {
            console.warn("[Cache] Redis get failed, fallback to DB", e);
        }

        if (!posts) {
            posts = await this.postRepository.getPosts({
                filter: { status: 'active', privacy: 'public' },
                limit,
                lastId: cursor
            });

            if (posts.length > 0) {
                // BẮT BUỘC STRINGIFY TRƯỚC KHI LƯU VÀO REDIS
                this.redis.set(cacheKey, JSON.stringify(posts), 'EX', this.CACHE_TTL_FEED)
                    .catch(err => console.error("[Cache] Set failed", err));
            }
        }

        if (!posts || !posts.length) {
            return { data: [], paging: { nextCursor: null, hasMore: false } };
        }

        const reactionsMap = new Map();
        if (userId) {
            const postIds = posts.map(p => p._id);
            const reactions = await this.postRepository.getReactionsByUserAndTargets(userId, postIds);
            reactions.forEach(r => reactionsMap.set(r.targetId.toString(), r.type));
        }

        const enrichedPosts = posts.map(post => ({
            ...post,
            userReaction: reactionsMap.get(post._id.toString()) || null
        }));

        const nextCursor = enrichedPosts[enrichedPosts.length - 1]._id;

        return {
            data: enrichedPosts,
            paging: {
                nextCursor,
                hasMore: enrichedPosts.length === limit
            }
        };
    }

    async getComments({ postId, page = 1, limit = 10 }) {
        const skip = (page - 1) * limit;
        return await this.postRepository.getComments(postId, skip, limit);
    }

    async getPostById(id) {
        const cacheKey = `post:${id}`;

        try {
            const cachedData = await this.redis.get(cacheKey);
            if (cachedData) return JSON.parse(cachedData); // SỬA LỖI JSON PARSE
        } catch (e) { }

        const post = await this.postRepository.findById(id);
        if (post) {
            this.redis.set(cacheKey, JSON.stringify(post), 'EX', this.CACHE_TTL_POST).catch(console.error);
        }

        return post;
    }

    async deletePost({ postId, userId }) {
        const deletedPost = await this.postRepository.softDeletePost(postId, userId);

        if (!deletedPost) {
            throw new AppError("Post not found or you do not have permission to delete it", 404);
        }

        this.redis.del(`post:${postId}`).catch(e => console.error("[Cache] Del error", e));

        this._invalidateFeedCacheBackground();

        return { message: "Post deleted successfully" };
    }

    async _invalidateFeedCacheBackground() {
        try {
            let cursor = '0';
            do {
                const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'feed:public:*', 'COUNT', 100);
                cursor = nextCursor;
                if (keys.length > 0) {
                    typeof this.redis.unlink === 'function' ? await this.redis.unlink(keys) : await this.redis.del(keys);
                }
            } while (cursor !== '0');
        } catch (e) {
            console.error('[Cache] Failed to invalidate feed cache:', e);
        }
    }
}

export default PostService;