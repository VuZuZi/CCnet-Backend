import mongoose from "mongoose";
import User from "../../user/user.model.js";
import Project from "../../project/project.model.js";
import { PROJECT_STATUS } from "../../project/project.constant.js";

const ADMIN_VISIBLE_PROJECT_STATUS_FILTER = {
  $ne: PROJECT_STATUS.DRAFT,
};

const ADMIN_PROJECT_POPULATE =
  "fullName email avatar phone isVerified role status";

class AdminProjectRepository {
  async findProjects({
    search = "",
    status = "",
    page = 1,
    limit = 50,
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      status: ADMIN_VISIBLE_PROJECT_STATUS_FILTER,
    };

    const normalizedStatus = String(status || "").trim().toUpperCase();
    if (normalizedStatus && normalizedStatus !== "ALL") {
      filter.status = normalizedStatus;
    }

    if (String(search || "").trim()) {
      const keyword = String(search).trim();
      const regex = { $regex: keyword, $options: "i" };

      const organizerMatches = await User.find({
        $or: [{ fullName: regex }, { email: regex }],
      })
        .select("_id")
        .lean()
        .exec();

      const organizerIds = organizerMatches.map((item) => item._id);

      const searchConditions = [
        { title: regex },
        { description: regex },
        { category: regex },
        { "location.address": regex },
        ...(organizerIds.length ? [{ organizerId: { $in: organizerIds } }] : []),
      ];

      if (mongoose.Types.ObjectId.isValid(keyword)) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(keyword) });
      }

      filter.$or = searchConditions;
    }

    const [items, total] = await Promise.all([
      Project.find(filter)
        .populate("organizerId", ADMIN_PROJECT_POPULATE)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      Project.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async findProjectsForReview({ skip = 0, limit = 50 } = {}) {
    return await Project.find({
      status: { $in: ["PENDING_APPROVAL", "REVISION_REQUESTED"] },
    })
      .populate("organizerId", ADMIN_PROJECT_POPULATE)
      .sort({ updatedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async findProjectById(id) {
    return await Project.findById(id)
      .populate("organizerId", ADMIN_PROJECT_POPULATE)
      .populate({
        path: "documents",
        select:
          "url publicId originalName mimetype size width height createdAt updatedAt",
      })
      .lean()
      .exec();
  }
}

export default AdminProjectRepository;