import Report from "../../report/report.model.js";
import Post from "../../communitypost/post.model.js";

class AdminReportRepository {
  async findAllReports() {
    return await Report.find()
      .populate("reporter_ref", "fullName username email avatar")
      .populate("target_ref")
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findAllPosts() {
    return await Post.find()
      .populate("author", "username email fullName avatar")
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findReportById(id) {
    return await Report.findById(id).populate("target_ref");
  }

  async deletePostById(id) {
    return await Post.findByIdAndDelete(id);
  }

  async saveReport(report) {
    return await report.save();
  }
}

export default AdminReportRepository;