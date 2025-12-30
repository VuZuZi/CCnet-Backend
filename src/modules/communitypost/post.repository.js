import Post from './post.model.js';

class PostRepository {
  async findAll() {
    return Post.find().sort({ createdAt: -1 });
  }
  findById = async (id) => {
  return await Post.findById(id).populate('author', 'fullName email')
  }

  async create(data) {
    return Post.create(data);
  }
}

export default PostRepository;
