import User from "../user/user.model.js";
import Report from "../report/report.model.js";
import Post from "../communitypost/post.model.js";

class AdminRepository {
  async getSystemStats() {
    const [userStats, reportStats, postCount] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            banned: { $sum: { $cond: ["$isBanned", 1, 0] } },
          },
        },
      ]),
      Report.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Post.countDocuments(),
    ]);

    return {
      users: userStats[0] || { total: 0, banned: 0 },
      reports: reportStats,
      projects: { total: postCount },
    };
  }

  async findAllUsers() {
    return await User.find().select("-password").sort({ createdAt: -1 });
  }

  async findUserById(id) {
    return await User.findById(id);
  }

  async updateUser(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { new: true });
  }

  async findAllReports() {
    return await Report.find()
      .populate("reporter_ref", "username email")
      .populate({
        path: "target_ref",
        select: "content title",
      })
      .sort({ createdAt: -1 });
  }

  async findAllProjects() {
    return await Post.find()
      .populate("author", "username email")
      .sort({ createdAt: -1 });
  }

  async deleteProject(id) {
    return await Post.findByIdAndDelete(id);
  }
}
export default AdminRepository;
