import ApiResponse from '../../core/Response.js';

class PostController {
  constructor({ postService, reportService }) {
    this.postService = postService;
    this.reportService = reportService;
  }

 getNewsFeed = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const cursor = req.query.cursor || null;
      
      const currentUserId = req.user ? req.user.userId : null;

      const result = await this.postService.getNewsFeed({
        cursor,
        limit,
        userId: currentUserId 
      });

      res.json({
        status: "success",
        data: result.data,
        paging: result.paging
      });
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
      const { content, privacy } = req.body;
      const files = req.files || [];

      const currentUser = {
        _id: req.user.userId, 
        username: req.user.email.split('@')[0],
        avatar: req.user.avatar,
        fullName: req.user.fullName
      };

      const post = await this.postService.createPost({
        content,
        files,
        user: currentUser, 
        privacy
      });

      return ApiResponse.created(res, post);
    } catch (error) {
      next(error);
    }
  };

 toggleReaction = async (req, res, next) => {
    try {
      const { type } = req.body; 
      const result = await this.postService.toggleReaction({
        postId: req.params.id,
        userId: req.user.userId,
        type
      });
      return ApiResponse.success(res, result);
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
      const report = await this.reportService.createReport(reportData);

      res.status(201).json({
        status: "success",
        data: report,
      });
    } catch (error) {
      next(error);
    }
  };

  addComment = async (req, res, next) => {
    try {
      if (!req.body.content) throw new Error("Content required");
      
      const currentUser = {
        _id: req.user.userId,
        fullName: req.user.fullName,
        avatar: req.user.avatar,
        username: req.user.email.split('@')[0] 
      };
      
      const comment = await this.postService.addComment({
        postId: req.params.id,
        user: currentUser,
        content: req.body.content
      });

      res.status(201).json({ status: "success", data: comment });
    } catch (error) {
      next(error);
    }
  };

  getComments = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const comments = await this.postService.getComments({
        postId: req.params.id,
        page: page
      });
      res.json({ status: "success", data: comments });
    } catch (error) {
      next(error);
    }
  };
}

export default PostController;
