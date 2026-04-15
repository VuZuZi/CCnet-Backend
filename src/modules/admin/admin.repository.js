import mongoose from "mongoose";
import User from "../user/user.model.js";
import Report from "../report/report.model.js";
import Post from "../communitypost/post.model.js";
import Project from "../project/project.model.js";
import { PROJECT_STATUS } from "../project/project.constant.js";
import AdminActionLog from "./adminActionLog.model.js";

const USER_SELECT_FIELDS =
  "fullName email avatar role status isActive isVerified createdAt updatedAt phone location headline about coolingPeriodEnd kyc";

const ACTION_LOG_EXCLUDED_ACTIONS = ["VERIFY_USER", "UNVERIFY_USER"];

class AdminRepository {
  async getSystemStats() {
    const [userStats, reportStats, projectStats] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            banned: {
              $sum: {
                $cond: [{ $eq: ["$status", "banned"] }, 1, 0],
              },
            },
            active: {
              $sum: {
                $cond: [{ $eq: ["$status", "active"] }, 1, 0],
              },
            },
            inactive: {
              $sum: {
                $cond: [{ $eq: ["$status", "inactive"] }, 1, 0],
              },
            },
            verified: {
              $sum: {
                $cond: [{ $eq: ["$isVerified", true] }, 1, 0],
              },
            },
          },
        },
      ]),
      Report.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Project.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const reportsTotal = reportStats.reduce(
      (sum, item) => sum + Number(item.count || 0),
      0
    );

    const projectsTotal = projectStats.reduce(
      (sum, item) => sum + Number(item.count || 0),
      0
    );

    return {
      users: userStats[0] || {
        total: 0,
        banned: 0,
        active: 0,
        inactive: 0,
        verified: 0,
      },
      reports: {
        total: reportsTotal,
        byStatus: reportStats,
      },
      projects: {
        total: projectsTotal,
        byStatus: projectStats,
      },
    };
  }

  async findAllUsers() {
    return await User.find()
      .select(USER_SELECT_FIELDS)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findUsers({ search = "", page = 1, limit = 20, role = "" } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {};

    if (role) {
      filter.role = String(role).trim().toLowerCase();
    }

    if (String(search || "").trim()) {
      const keyword = String(search).trim();
      const regex = { $regex: keyword, $options: "i" };

      const searchConditions = [
        { fullName: regex },
        { email: regex },
        { username: regex },
        { role: regex },
      ];

      if (mongoose.Types.ObjectId.isValid(keyword)) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(keyword) });
      }

      filter.$or = searchConditions;
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select(USER_SELECT_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      User.countDocuments(filter),
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

  async findUserById(id) {
    return await User.findById(id);
  }

  async updateUser(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { new: true });
  }

  async createAdminActionLog(payload) {
    return await AdminActionLog.create(payload);
  }

  async findAdminActionLogs({
    page = 1,
    limit = 10,
    search = "",
    action = "",
    targetType = "",
    targetId = "",
    actorId = "",
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      action: {
        $nin: ACTION_LOG_EXCLUDED_ACTIONS,
      },
    };

    const normalizedTargetType = String(targetType || "").trim().toLowerCase();
    if (normalizedTargetType) {
      filter.targetType = normalizedTargetType;
    }

    if (String(targetId || "").trim()) {
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        return {
          items: [],
          pagination: {
            page: safePage,
            limit: safeLimit,
            total: 0,
            totalPages: 1,
          },
        };
      }

      filter.targetId = new mongoose.Types.ObjectId(targetId);
    }

    if (String(actorId || "").trim()) {
      if (!mongoose.Types.ObjectId.isValid(actorId)) {
        return {
          items: [],
          pagination: {
            page: safePage,
            limit: safeLimit,
            total: 0,
            totalPages: 1,
          },
        };
      }

      filter.actorId = new mongoose.Types.ObjectId(actorId);
    }

    if (String(action || "").trim()) {
      filter.action = String(action).trim();
    }

    if (String(search || "").trim()) {
      const keyword = String(search).trim();
      const regex = { $regex: keyword, $options: "i" };

      const matchedActors = await User.find({
        $or: [{ fullName: regex }, { email: regex }],
      })
        .select("_id")
        .lean()
        .exec();

      const actorIds = matchedActors.map((item) => item._id);

      const searchConditions = [
        { reason: regex },
        { "metadata.email": regex },
        { "metadata.fullName": regex },
        { "metadata.organizationName": regex },
        { "metadata.projectTitle": regex },
        { "metadata.projectType": regex },
        ...(actorIds.length ? [{ actorId: { $in: actorIds } }] : []),
      ];

      if (mongoose.Types.ObjectId.isValid(keyword)) {
        searchConditions.push({
          targetId: new mongoose.Types.ObjectId(keyword),
        });
      }

      filter.$or = searchConditions;
    }

    const [items, total] = await Promise.all([
      AdminActionLog.find(filter)
        .populate("actorId", "fullName email avatar role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      AdminActionLog.countDocuments(filter),
    ]);

    const normalizedItems = items.map((item) => ({
      ...item,
      actorName: item?.actorId?.fullName || "",
      actorEmail: item?.actorId?.email || "",
      targetUserName: item?.metadata?.fullName || "",
      targetUserEmail: item?.metadata?.email || "",
      applicantName: item?.metadata?.fullName || "",
      applicantEmail: item?.metadata?.email || "",
      organizationName: item?.metadata?.organizationName || "",
      projectTitle: item?.metadata?.projectTitle || "",
      projectType: item?.metadata?.projectType || "",
      previousStatus: item?.previousState?.status || "",
      nextStatus: item?.nextState?.status || "",
      targetIdString: item?.targetId ? String(item.targetId) : "",
    }));

    return {
      items: normalizedItems,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async findOrganizerRequestActionLogs({
    page = 1,
    limit = 10,
    search = "",
    action = "",
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      targetType: "organizer_request",
      action: {
        $in: ["APPROVE_ORGANIZER_REQUEST", "DECLINE_ORGANIZER_REQUEST"],
      },
    };

    if (String(action || "").trim()) {
      filter.action = String(action).trim();
    }

    if (String(search || "").trim()) {
      const keyword = String(search).trim();
      const regex = { $regex: keyword, $options: "i" };

      const matchedActors = await User.find({
        $or: [{ fullName: regex }, { email: regex }],
      })
        .select("_id")
        .lean()
        .exec();

      const actorIds = matchedActors.map((item) => item._id);

      filter.$or = [
        { reason: regex },
        { "metadata.fullName": regex },
        { "metadata.email": regex },
        { "metadata.organizationName": regex },
        ...(actorIds.length ? [{ actorId: { $in: actorIds } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      AdminActionLog.find(filter)
        .populate("actorId", "fullName email avatar role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      AdminActionLog.countDocuments(filter),
    ]);

    const normalizedItems = items.map((item) => ({
      ...item,
      actorName: item?.actorId?.fullName || "",
      actorEmail: item?.actorId?.email || "",
      applicantName: item?.metadata?.fullName || "",
      applicantEmail: item?.metadata?.email || "",
      organizationName: item?.metadata?.organizationName || "",
    }));

    return {
      items: normalizedItems,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async findAllProjects(query = {}) {
    void query;

    return await Project.find({
      status: { $ne: PROJECT_STATUS.DRAFT },
    })
      .populate("organizerId", "fullName email avatar isVerified role status")
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findProjects(query = {}) {
    return await this.findAllProjects(query);
  }

  async deleteProject(id) {
    return await Project.findByIdAndDelete(id);
  }

  async findProjectsForReview({ skip = 0, limit = 50 }) {
    return await Project.find({
      status: { $in: ["PENDING_APPROVAL", "REVISION_REQUESTED"] },
    })
      .populate(
        "organizerId",
        "fullName email avatar isVerified kyc coolingPeriodEnd"
      )
      .sort({ updatedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async findProjectById(id) {
    return await Project.findById(id)
      .populate(
        "organizerId",
        "fullName email avatar isVerified kyc coolingPeriodEnd"
      )
      .lean()
      .exec();
  }

  async updateUserCoolingPeriod(userId, endDate, session = null) {
    return await User.findByIdAndUpdate(
      userId,
      { $set: { coolingPeriodEnd: endDate } },
      { new: true, session }
    )
      .lean()
      .exec();
  }

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
}

export default AdminRepository;