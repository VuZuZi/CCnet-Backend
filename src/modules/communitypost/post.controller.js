class PostController {
  constructor({ postService }) {
    this.postService = postService;
  }

  getAllPosts = async (req, res, next) => {
    try {
      const posts = await this.postService.getAllPosts();
      res.json({ status: 'success', data: posts });
    } catch (err) {
      next(err);
    }
  };

  createPost = async (req, res, next) => {
  try {
    const { content, images = [], links = [] } = req.body

    const post = await this.postService.createPost({
      content,
      images,
      links,
      author: req.user?.userId,
    })

    res.status(201).json({
      status: 'success',
      data: post,
    })
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

    res.json({
      status: 'success',
      data: post,
    })
  } catch (error) {
    next(error)
  }
}


}

export default PostController;
