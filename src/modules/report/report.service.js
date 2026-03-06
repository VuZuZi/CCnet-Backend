import Post from "../communitypost/post.model.js";

class ReportService {
  constructor({ reportRepository }) {
    this.reportRepository = reportRepository;
  }

  async createReport(data) {
    const existingReport = await this.reportRepository.findOne({
      reporter_ref: data.reporter_ref,
      target_ref: data.target_ref,
    });

    if (existingReport) {
      const error = new Error("You have already reported this content.");
      error.statusCode = 400;
      throw error;
    }

    if (data.target_type === "post") {
      const post = await Post.findById(data.target_ref);
      if (!post) {
        const error = new Error("Target post not found");
        error.statusCode = 404;
        throw error;
      }
    }

    return this.reportRepository.create(data);
  }

  async getReports(query = {}) {
    return this.reportRepository.findAll(query);
  }

  async reviewReport(reportId, reviewerId, updateData) {
    return this.reportRepository.update(reportId, {
      ...updateData,
      reviewed_by_ref: reviewerId,
      reviewed_at: new Date(),
    });
  }
}

export default ReportService;
