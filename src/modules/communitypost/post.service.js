import mongoose from "mongoose";
import Post from "../communitypost/post.model.js";

class PostService {
  constructor({ postRepository }) {
    this.postRepository = postRepository;
  }
  async getAllPosts({
    skip = 0,
    limit = 10,
    sort = { createdAt: -1 },
    populate = ["author", "comments.author"],
  } = {}) {
    try {
      return await this.postRepository.findAll({
        skip,
        limit,
        sort,
        populate,
      });
    } catch (error) {
      throw error;
    }
  }

  async getPostById(id) {
    try {
      const post = await this.postRepository.findById(id);
      if (!post) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }
      return post;
    } catch (error) {
      throw error;
    }
  }

  async createPost(data) {
    try {
      return await this.postRepository.create(data);
    } catch (error) {
      throw error;
    }
  }
  async toggleReaction({ postId, userId, reactionType }) {
    if (!["like", "dislike"].includes(reactionType)) {
      const error = new Error("Invalid reaction type");
      error.statusCode = 400;
      throw error;
    }

    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (err) {
      const error = new Error("Invalid user ID format");
      error.statusCode = 400;
      throw error;
    }

    const post = await this.postRepository.findByIdRaw(postId);
    if (!post) {
      const error = new Error("Post not found");
      error.statusCode = 404;
      throw error;
    }

    const target = reactionType === "like" ? "likes" : "dislikes";
    const opposite = reactionType === "like" ? "dislikes" : "likes";
    post[opposite] = post[opposite].filter((id) => !id.equals(userObjectId));
    const isAlreadyReacted = post[target].some((id) => id.equals(userObjectId));

    if (isAlreadyReacted) {
      post[target] = post[target].filter((id) => !id.equals(userObjectId));
    } else {
      post[target].push(userObjectId);
    }

    await this.postRepository.save(post);

    return this.postRepository.findById(postId);
  }

  async addComment({ postId, userId, content }) {
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (err) {
      const error = new Error("Invalid user ID");
      error.statusCode = 400;
      throw error;
    }

    const post = await this.postRepository.findByIdRaw(postId);
    if (!post) {
      const error = new Error("Post not found");
      error.statusCode = 404;
      throw error;
    }

    post.comments.push({
      content,
      author: userObjectId,
      createdAt: new Date(),
    });

    await this.postRepository.save(post);
    return this.postRepository.findById(postId);
  }

  async countPosts() {
    return await Post.countDocuments();
  }
}

export default PostService;
