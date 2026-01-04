class PostService {
  constructor({ postRepository }) {
    this.postRepository = postRepository
  }

  async getAllPosts() {
    return this.postRepository.findAll()
  }

  async getPostById(id) {
    const post = await this.postRepository.findById(id)
    if (!post) {
      const error = new Error('Post not found')
      error.statusCode = 404
      throw error
    }
    return post
  }

  async createPost(data) {
    return this.postRepository.create(data)
  }

  async toggleReaction({ postId, userId, reactionType }) {
    if (!['like', 'dislike'].includes(reactionType)) {
      const error = new Error('Invalid reaction type')
      error.statusCode = 400
      throw error
    }

    const post = await this.postRepository.findByIdRaw(postId)
    if (!post) {
      const error = new Error('Post not found')
      error.statusCode = 404
      throw error
    }

    const target = reactionType === 'like' ? 'likes' : 'dislikes'
    const opposite = reactionType === 'like' ? 'dislikes' : 'likes'

    post[opposite].pull(userId)


    if (post[target].includes(userId)) {
      post[target].pull(userId)
    } else {
      post[target].push(userId)
    }

    await this.postRepository.save(post)

    return this.postRepository.findById(postId)
  }

  async addComment({ postId, userId, content }) {
    const post = await this.postRepository.findByIdRaw(postId)
    if (!post) {
      const error = new Error('Post not found')
      error.statusCode = 404
      throw error
    }

    post.comments.push({
      content,
      author: userId,
    })

    await this.postRepository.save(post)

    return this.postRepository.findById(postId)
  }
}

export default PostService