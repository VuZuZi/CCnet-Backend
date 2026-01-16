import mongoose from "mongoose";
import Report from "../report/report.model.js";
import { getContainer } from "../../container/index.js";
class PostController {
  constructor({ postService, reportService }) {
    this.postService = postService;
    this.reportService = reportService;
  }

  getAllPosts = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const posts = await this.postService.getAllPosts({
        skip,
        limit,
        sort: { createdAt: -1 }, // Newest first
      });
      res.json({ status: "success", data: posts });
    } catch (error) {
      next(error);
    }
  };

  getPostById = async (req, res, next) => {
    try {
      const post = await this.postService.getPostById(req.params.id);

      if (!post) {
        return res.status(404).json({
          status: "error",
          message: "Post not found",
        });
      }

      res.json({ status: "success", data: post });
    } catch (error) {
      next(error);
    }
  };

  createPost = async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      console.log("Received body:", req.body);

      const { content, images = [] } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Post content is required",
        });
      }

      const post = await this.postService.createPost({
        content: content.trim(),
        images,
        author: req.user.userId,
      });

      res.status(201).json({
        status: "success",
        data: post,
      });
    } catch (error) {
      next(error);
    }
  };

  toggleLike = async (req, res, next) => {
    try {
      const post = await this.postService.toggleReaction({
        postId: req.params.id,
        userId: req.user.userId,
        reactionType: "like",
      });

      res.json({ status: "success", data: post });
    } catch (error) {
      next(error);
    }
  };

  toggleDislike = async (req, res, next) => {
    try {
      const post = await this.postService.toggleReaction({
        postId: req.params.id,
        userId: req.user.userId,
        reactionType: "dislike",
      });

      res.json({ status: "success", data: post });
    } catch (error) {
      next(error);
    }
  };
  reportPost = async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const reporterId = req.user._id;

      const reportData = {
        ...req.body,
        reporter_ref: reporterId,
        target_ref: req.params.id,
      };

      // Now you can use this.reportService directly (clean & injected)
      const report = await this.reportService.createReport(reportData);

      res.status(201).json({
        status: "success",
        data: report,
      });
    } catch (error) {
      next(error);
    }
  };

  // ... other methods ...

  addComment = async (req, res, next) => {
    try {
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Comment content is required",
        });
      }

      const updatedPost = await this.postService.addComment({
        postId: req.params.id,
        userId: req.user.userId,
        content: content.trim(),
      });
      const newComment = updatedPost.comments[updatedPost.comments.length - 1];

      res.status(201).json({
        status: "success",
        data: newComment,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default PostController;
