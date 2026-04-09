import User from "../user/user.model.js";
import Report from "../report/report.model.js";
import Post from "../communitypost/post.model.js";
import Project from "../project/project.model.js";

class AdminRepository {
  async getSystemStats() {
    const [userStats, reportStats, projectStats] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            banned: { $sum: { $cond: [{ $eq: ["$status", "banned"] }, 1, 0] } },
          },
        },
      ]),
      Report.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Project.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
    ]);

    return {
      users: userStats[0] || { total: 0, banned: 0 },
      reports: reportStats,
      projects: projectStats,
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

  // async findAllReports() {
  //   return await Report.find()
  //     .populate("reporter_ref", "username email")
  //     .populate({
  //       path: "target_ref",
  //       select: "content title fullName email isActive status",
  //     })
  //     .sort({ createdAt: -1 });
  // }

  async findAllProjects() {
    return await Post.find()
      .populate("author", "username email")
      .sort({ createdAt: -1 });
  }

  async deleteProject(id) {
    return await Post.findByIdAndDelete(id);
  }

  async findProjectsForReview({ skip = 0, limit = 10 }) {
    return await Project.find({ 
        status: { $in: ['PENDING_APPROVAL', 'REVISION_REQUESTED'] } 
      })
      .populate("organizerId", "fullName email kyc")
      .sort({ updatedAt: 1 }) // Dự án nào đợi lâu nhất lên đầu
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async findProjectById(id) {
    return await Project.findById(id)
      .populate("organizerId", "fullName email kyc coolingPeriodEnd")
      .lean()
      .exec();
  }

  async updateUserCoolingPeriod(userId, endDate, session = null) {
    return await User.findByIdAndUpdate(
      userId,
      { $set: { coolingPeriodEnd: endDate } },
      { new: true, session }
    ).lean().exec();
  }

  async findAllReports() {
    return await Report.find()
      .populate("reporter_ref", "fullName email")
      .populate("target_ref")
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
export default AdminRepository;
