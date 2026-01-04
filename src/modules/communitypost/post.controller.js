class PostController {
  constructor({ postService }) {
    this.postService = postService
  }

  getAllPosts = async (req, res, next) => {
    try {
      const posts = await this.postService.getAllPosts()
      res.json({ status: 'success', data: posts })
    } catch (error) {
      next(error)
    }
  }

  getPostById = async (req, res, next) => {
    try {
      const post = await this.postService.getPostById(req.params.id)

      if (!post) {
        return res.status(404).json({
          status: 'error',
          message: 'Post not found',
        })
      }

      res.json({ status: 'success', data: post })
    } catch (error) {
      next(error)
    }
  }

  createPost = async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required',
        })
      }

      const { content, links = [] } = req.body

      if (!content || !content.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Post content is required',
        })
      }

      const images =
        req.files?.map(file => `/uploads/${file.filename}`) || []

      const post = await this.postService.createPost({
        content: content.trim(),
        images,
        links: links.filter(Boolean), // remove empty strings
        author: req.user.userId,
      })

      res.status(201).json({
        status: 'success',
        data: post,
      })
    } catch (error) {
      next(error)
    }
  }

  // Toggle like: add if not liked, remove if already liked
  toggleLike = async (req, res, next) => {
    try {
      const post = await this.postService.toggleReaction({
        postId: req.params.id,
        userId: req.user.userId,
        reactionType: 'like',
      })

      res.json({ status: 'success', data: post })
    } catch (error) {
      next(error)
    }
  }

  // Toggle dislike
  toggleDislike = async (req, res, next) => {
    try {
      const post = await this.postService.toggleReaction({
        postId: req.params.id,
        userId: req.user.userId,
        reactionType: 'dislike',
      })

      res.json({ status: 'success', data: post })
    } catch (error) {
      next(error)
    }
  }

  // Add a comment
  addComment = async (req, res, next) => {
    try {
      const { content } = req.body

      if (!content || !content.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Comment content is required',
        })
      }

      const updatedPost = await this.postService.addComment({
        postId: req.params.id,
        userId: req.user.userId,
        content: content.trim(),
      })

      // Return only the new comment for frontend efficiency
      const newComment = updatedPost.comments[updatedPost.comments.length - 1]

      res.status(201).json({
        status: 'success',
        data: newComment,
      })
    } catch (error) {
      next(error)
    }
  }
}

export default PostController