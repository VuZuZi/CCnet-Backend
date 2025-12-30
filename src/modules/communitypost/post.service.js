class PostService {
  constructor({ postRepository }) {
    this.postRepository = postRepository;
  }

  async getAllPosts() {
    return this.postRepository.findAll();
  }
  getPostById = async (id) => {
  return this.postRepository.findById(id)
  }

  async createPost(user, content) {
    return this.postRepository.create({
      content,
      author: user.userId,
      authorName: user.fullName
    });
  }
}

export default PostService;
