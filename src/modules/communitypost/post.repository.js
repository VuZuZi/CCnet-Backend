import Post from "./post.model.js";

class PostRepository {
  async findAll({ skip = 0, limit = 10, sort = { createdAt: -1 } } = {}) {
    return Post.find()
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("author", "fullName avatar email username")
      .populate({
        path: "comments.author",
        select: "fullName avatar email username",
      })
      .exec();
  }

  async findById(id) {
    return Post.findById(id)
      .populate("author", "fullName avatar email username")
      .populate({
        path: "comments.author",
        select: "fullName avatar email username",
      });
  }

  async create(data) {
    const post = new Post(data);
    return post.save();
  }

  async findByIdRaw(id) {
    return Post.findById(id);
  }

  async save(post) {
    return post.save();
  }
}

export default PostRepository;
