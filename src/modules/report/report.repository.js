import mongoose from "mongoose"; // FIX: Added missing import
import Report from "./report.model.js";

class ReportRepository {
  async findOne(filter) {
    return Report.findOne(filter);
  }

  async create(data) {
    const report = new Report(data);
    try {
      return await report.save();
    } catch (saveError) {
      console.error("DATABASE_SAVE_ERROR:", saveError.message);
      throw saveError;
    }
  }

  async findAll({ page = 1, limit = 20, status, target_type } = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (target_type) filter.target_type = target_type;

    const skip = (page - 1) * limit;

    return Report.find(filter)
      .populate("reporter_ref", "fullName avatar")
      .populate("reviewed_by_ref", "fullName")
      .populate({
        path: "target_ref",
        select: "content title text",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  async update(reportId, updateData) {
    return Report.findByIdAndUpdate(reportId, updateData, { new: true })
      .populate("reporter_ref", "fullName")
      .populate("reviewed_by_ref", "fullName");
  }
}

export default ReportRepository;
