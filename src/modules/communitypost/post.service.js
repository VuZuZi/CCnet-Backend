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

    _processContent(content) {
        if (!content) return { cleanContent: '', hashtags: [] };

        const hashtags = (content.match(/#[a-z0-9_]+/gi) || [])
            .map(tag => tag.toLowerCase().replace('#', ''));

        return {
            cleanContent: content.trim(),
            hashtags: [...new Set(hashtags)]
        };
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
        let images = [];
        if (files?.length) {
            const uploadedMedias = await this.mediaService.uploadMultiple(files, user._id, 'post');
            images = uploadedMedias.map(m => ({
                url: m.url, publicId: m.publicId,
                blurHash: m.blurHash, width: m.width, height: m.height,
                aspectRatio: m.height ? (m.width / m.height) : 1
            }));
        }

        if (!content?.trim() && !images.length) {
            throw new AppError("Post content or image required", 400);
        }

        const postData = {
            author: {
                _id: user._id,
                fullName: user.fullName,
                avatar: user.avatar,
                username: user.username
            },
            content: content?.trim(),
            hashtags: this._extractHashtags(content),
            images,
            privacy: privacy || 'public',
            stats: { likes: 0, comments: 0, shares: 0, views: 0 },
            latestComments: []
        };

        const newPost = await this.postRepository.create(postData);

        const firstPageKey = this._getFeedKey(null, 10);
        await this.redis.del(firstPageKey);

        return newPost;
    }

    async addComment({ postId, user, content }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const newComment = await this.postRepository.createComment({
                postId, author: user._id, content
            }, session);

            const commentSnapshot = {
                _id: newComment._id,
                content: content,
                author: {
                    _id: user._id,
                    fullName: user.fullName,
                    avatar: user.avatar,
                    username: user.username
                },
                createdAt: newComment.createdAt || new Date()
            };

            await this.postRepository.pushLatestCommentToPost(postId, commentSnapshot, session);

            await session.commitTransaction();

            await this.redis.del(`post:${postId}`);

            return newComment;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async toggleReaction({ postId, userId, type }) {
        const session = await mongoose.startSession();
        let result = { action: '', type };

        try {
            await session.withTransaction(async () => {
                const existingReaction = await this.postRepository.upsertReaction(
                    { userId, postId, type },
                    session
                );

                const isUpdate = existingReaction.lastErrorObject?.updatedExisting || existingReaction.ok;

                const oldType = existingReaction.value ? existingReaction.value.type : null;

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

            await this.redis.del(`post:${postId}`);

        } catch (error) {
            throw error;
        } finally {
            session.endSession();
        }

        return result;
    }

    async getNewsFeed({ cursor, limit = 10, userId }) {
        const cacheKey = this._getFeedKey(cursor, limit);

        let posts = null;
        try {
            posts = await this.redis.get(cacheKey);
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
                this.redis.set(cacheKey, posts, 'EX', this.CACHE_TTL_FEED)
                    .catch(err => console.error("[Cache] Set failed", err));
            }
        }

        if (!posts || !posts.length) {
            return { data: [], paging: { nextCursor: null, hasMore: false } };
        }

        let reactionsMap = new Map();
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
            const cachedPost = await this.redis.get(cacheKey);
            if (cachedPost) return cachedPost;
        } catch (e) { }

        const post = await this.postRepository.findById(id);
        if (post) {
            this.redis.set(cacheKey, post, 'EX', this.CACHE_TTL_POST).catch(console.error);
        }

        return post;
    }

}

export default PostService;