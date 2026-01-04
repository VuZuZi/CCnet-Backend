import Post from './post.model.js'

class PostRepository {
  async findAll() {
    return Post.find()
      .populate('author', 'fullName email avatar') 
      .populate('likes', 'fullName avatar')
      .populate('dislikes', 'fullName avatar')
      .populate('comments.author', 'fullName email avatar')
      .sort({ createdAt: -1 })
  }

  async findById(id) {
    return Post.findById(id)
      .populate('author', 'fullName email avatar')
      .populate('likes', 'fullName avatar')
      .populate('dislikes', 'fullName avatar')
      .populate('comments.author', 'fullName email avatar')
  }

  async create(data) {
    const post = new Post(data)
    return post.save()
  }

  async findByIdRaw(id) {
    return Post.findById(id)
  }

  async save(post) {
    return post.save()
  }
}

export default PostRepository