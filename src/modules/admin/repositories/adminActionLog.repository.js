import mongoose from "mongoose";
import User from "../../user/user.model.js";
import AdminActionLog from "../adminActionLog.model.js";
import {
  buildPagination,
  createEmptyPaginatedResult,
  normalizeAdminActionLogItem,
  normalizeOrganizerActionLogItem,
} from "../utils/adminActionLog.utils.js";

const ACTION_LOG_EXCLUDED_ACTIONS = ["VERIFY_USER", "UNVERIFY_USER"];

class AdminActionLogRepository {
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
        return createEmptyPaginatedResult(safePage, safeLimit);
      }

      filter.targetId = new mongoose.Types.ObjectId(targetId);
    }

    if (String(actorId || "").trim()) {
      if (!mongoose.Types.ObjectId.isValid(actorId)) {
        return createEmptyPaginatedResult(safePage, safeLimit);
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
        { "metadata.title": regex },
        { "metadata.message": regex },
        { "metadata.severity": regex },
        { "metadata.targetType": regex },
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

    return {
      items: items.map(normalizeAdminActionLogItem),
      pagination: buildPagination(safePage, safeLimit, total),
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

    return {
      items: items.map(normalizeOrganizerActionLogItem),
      pagination: buildPagination(safePage, safeLimit, total),
    };
  }
}

export default AdminActionLogRepository;