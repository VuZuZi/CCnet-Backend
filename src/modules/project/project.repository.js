import mongoose from "mongoose";
import Project from "./project.model.js";
import {
  PUBLIC_PROJECT_STATUSES,
  PROJECT_STATUS,
  PROJECT_TYPE,
  WORKSPACE_CANCELLED_STATUSES,
  WORKSPACE_COMPLETED_STATUSES,
} from "./project.constant.js";

const PROJECT_CARD_PROJECTION = {
  title: 1,
  slug: 1,
  summary: 1,
  description: 1,
  coverMedia: 1,
  category: 1,
  targetAmount: 1,
  currentAmount: 1,
  "location.address": 1,
  isUrgent: 1,
  endDate: 1,
  startDate: 1,
  stats: 1,
  organizerId: 1,
  needsVolunteers: 1,
  isVolunteerFull: 1,
  projectType: 1,
  volunteerRoles: 1,
  status: 1,
  createdAt: 1,
};

const ORGANIZER_PROJECT_PROJECTION = {
  title: 1,
  coverMedia: 1,
  category: 1,
  targetAmount: 1,
  currentAmount: 1,
  status: 1,
  milestones: 1,
  createdAt: 1,
  updatedAt: 1,
  projectType: 1,
  needsVolunteers: 1,
  volunteerRoles: 1,
  stats: 1,
  startDate: 1,
  endDate: 1,
  "location.address": 1,
};

const ORGANIZER_CARD_POPULATE = {
  path: "organizerId",
  select: "fullName avatar",
};

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(value);

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const buildWorkspaceStatusFilter = (status) => {
  if (!status || status === "ALL") return undefined;

  if (status === "COMPLETED") {
    return { $in: WORKSPACE_COMPLETED_STATUSES };
  }

  if (status === "CANCELLED") {
    return { $in: WORKSPACE_CANCELLED_STATUSES };
  }

  return status;
};

const VOLUNTEER_ONLY_SYNCABLE_STATUSES = new Set([
  PROJECT_STATUS.RECRUITING,
  PROJECT_STATUS.EXECUTING,
]);

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class ProjectRepository {
  async create(projectData, session = null) {
    const docs = await Project.create([projectData], { session });
    return docs[0];
  }

  async incrementFunding(projectId, amount, session = null) {
    return await Project.findByIdAndUpdate(
      projectId,
      { $inc: { currentAmount: amount } },
      { new: true, runValidators: true, session }
    )
      .lean()
      .exec();
  }

  async updateById(projectId, updateData, session = null) {
    return await Project.findByIdAndUpdate(
      projectId,
      { $set: updateData },
      { new: true, runValidators: true, session }
    )
      .lean()
      .exec();
  }

  async transitionStatus(projectId, fromStatus, toStatus, session = null) {
    if (!isValidObjectId(projectId)) return null;

    return await Project.findOneAndUpdate(
      {
        _id: toObjectId(projectId),
        status: fromStatus,
      },
      { $set: { status: toStatus } },
      { new: true, session }
    )
      .lean()
      .exec();
  }

  async syncVolunteerOnlyExecutionStatus(projectId, session = null) {
    if (!isValidObjectId(projectId)) return null;

    const project = await Project.findById(projectId).session(session).lean().exec();
    if (!project) return null;

    if (project.projectType !== PROJECT_TYPE.VOLUNTEER_ONLY) {
      return project;
    }

    if (!VOLUNTEER_ONLY_SYNCABLE_STATUSES.has(String(project.status))) {
      return project;
    }

    const now = new Date();
    const currentVolunteers = Number(project?.stats?.currentVolunteers || 0);
    const targetVolunteers = Number(project?.stats?.targetVolunteers || 0);

    const reachedVolunteerTarget =
      targetVolunteers > 0 && currentVolunteers >= targetVolunteers;

    const reachedStartDate =
      Boolean(project?.startDate) && new Date(project.startDate) <= now;

    let nextStatus = project.status;

    if (project.status === PROJECT_STATUS.RECRUITING) {
      if (reachedVolunteerTarget || reachedStartDate) {
        nextStatus = PROJECT_STATUS.EXECUTING;
      }
    } else if (project.status === PROJECT_STATUS.EXECUTING) {
      const shouldReturn =
        !reachedStartDate &&
        targetVolunteers > 0 &&
        currentVolunteers < targetVolunteers;

      if (shouldReturn) {
        nextStatus = PROJECT_STATUS.RECRUITING;
      }
    }

    if (nextStatus === project.status) return project;

    return await Project.findByIdAndUpdate(
      projectId,
      { $set: { status: nextStatus } },
      { new: true, session }
    )
      .lean()
      .exec();
  }

  async incrementProjectStats(projectId, increments, session = null) {
    if (!increments["stats.currentVolunteers"]) {
      return await Project.findByIdAndUpdate(
        projectId,
        { $inc: increments },
        { new: true, runValidators: true, session }
      )
        .lean()
        .exec();
    }

    return await Project.findByIdAndUpdate(
      projectId,
      [
        {
          $set: {
            "stats.currentVolunteers": {
              $max: [
                {
                  $add: [
                    { $ifNull: ["$stats.currentVolunteers", 0] },
                    increments["stats.currentVolunteers"],
                  ],
                },
                0,
              ],
            },
          },
        },
        {
          $set: {
            isVolunteerFull: {
              $and: [
                { $gt: [{ $ifNull: ["$stats.targetVolunteers", 0] }, 0] },
                {
                  $gte: [
                    "$stats.currentVolunteers",
                    { $ifNull: ["$stats.targetVolunteers", 0] },
                  ],
                },
              ],
            },
          },
        },
      ],
      { new: true, session }
    )
      .lean()
      .exec();
  }

  async findById(projectId, session = null) {
    if (!isValidObjectId(projectId)) return null;
    return await Project.findById(projectId).session(session).lean().exec();
  }

  async checkExists(projectId) {
    if (!isValidObjectId(projectId)) return false;
    const project = await Project.exists({ _id: projectId });
    return Boolean(project);
  }

  async findFeaturedProjects(limit = 1) {
    return await Project.find({
      status: { $in: PUBLIC_PROJECT_STATUSES },
      isUrgent: true,
      endDate: { $gt: new Date() },
    })
      .select(PROJECT_CARD_PROJECTION)
      .populate(ORGANIZER_CARD_POPULATE)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async findCandidateFeaturedProjects(limit = 24) {
    return await Project.find({
      status: { $in: PUBLIC_PROJECT_STATUSES },
    })
      .select(PROJECT_CARD_PROJECTION)
      .populate(ORGANIZER_CARD_POPULATE)
      .sort({
        isUrgent: -1,
        "stats.viewCount": -1,
        "stats.followerCount": -1,
        createdAt: -1,
      })
      .limit(limit)
      .lean()
      .exec();
  }

  async findVolunteerProjects(limit = 4) {
    return await Project.find({
      status: { $in: PUBLIC_PROJECT_STATUSES },
      needsVolunteers: true,
      isVolunteerFull: false,
    })
      .select(PROJECT_CARD_PROJECTION)
      .populate(ORGANIZER_CARD_POPULATE)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async findAllProjects({
    filter = {},
    skip = 0,
    limit = 9,
    sortType = "newest",
    textSearch = null,
  }) {
    const queryFilter = {
      status: { $in: PUBLIC_PROJECT_STATUSES },
      ...filter,
    };

    let finalSort = { createdAt: -1 };

    if (sortType === "trending") {
      finalSort = { "stats.viewCount": -1, createdAt: -1 };
    } else if (sortType === "ending_soon") {
      finalSort = { endDate: 1, createdAt: -1 };
    }

    if (textSearch && String(textSearch).trim()) {
      queryFilter["location.address"] = {
        $regex: escapeRegex(textSearch),
        $options: "i",
      };
    }

    const [projects, total] = await Promise.all([
      Project.find(queryFilter)
        .select(PROJECT_CARD_PROJECTION)
        .populate(ORGANIZER_CARD_POPULATE)
        .sort(finalSort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Project.countDocuments(queryFilter),
    ]);

    return { projects, total };
  }

  async findByIdWithDetails(projectId) {
    if (!isValidObjectId(projectId)) return null;

    return await Project.findById(projectId)
      .populate({
        path: "organizerId",
        select: "fullName avatar email isVerified",
      })
      .populate({
        path: "documents",
        select: "url publicId originalName mimetype size",
      })
      .lean()
      .exec();
  }

  async getOrganizerStats(organizerId) {
    const stats = await Project.aggregate([
      {
        $match: {
          organizerId: toObjectId(organizerId),
        },
      },
      {
        $group: {
          _id: null,
          totalFundsRaised: { $sum: "$currentAmount" },
          activeProjects: {
            $sum: {
              $cond: [{ $in: ["$status", PUBLIC_PROJECT_STATUSES] }, 1, 0],
            },
          },
          pendingProjects: {
            $sum: {
              $cond: [
                { $eq: ["$status", PROJECT_STATUS.PENDING_APPROVAL] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    return stats[0] || {
      totalFundsRaised: 0,
      activeProjects: 0,
      pendingProjects: 0,
    };
  }

  async findOrganizerProjects({
    organizerId,
    status,
    sortType = "newest",
    skip = 0,
    limit = 10,
  }) {
    const filter = {
      organizerId: toObjectId(organizerId),
    };

    const statusFilter = buildWorkspaceStatusFilter(status);
    if (statusFilter) filter.status = statusFilter;

    const finalSort =
      sortType === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .select(ORGANIZER_PROJECT_PROJECTION)
        .populate(ORGANIZER_CARD_POPULATE)
        .sort(finalSort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Project.countDocuments(filter),
    ]);

    return { projects, total };
  }

  async updateDraftAtomic(projectId, organizerId, updateData, session = null) {
    if (!isValidObjectId(projectId) || !isValidObjectId(organizerId)) {
      return null;
    }

    return await Project.findOneAndUpdate(
      {
        _id: toObjectId(projectId),
        organizerId: toObjectId(organizerId),
        status: PROJECT_STATUS.DRAFT,
      },
      { $set: updateData },
      { new: true, runValidators: true, session }
    )
      .lean()
      .exec();
  }

  async findExpiredFundingProjects(currentDate, limit = 50) {
    return await Project.find({
      status: PROJECT_STATUS.FUNDING,
      endDate: { $lt: currentDate },
    })
      .select(
        "_id title currentAmount targetAmount mvpAmount organizerId endDate status"
      )
      .limit(limit)
      .lean()
      .exec();
  }

  async decrementFunding(projectId, amount, session = null) {
    return await Project.findByIdAndUpdate(
      projectId,
      { $inc: { currentAmount: -amount } },
      { new: true, session, runValidators: true }
    ).lean().exec();
  }

  async updateMilestoneStatus(projectId, milestoneId, status, session = null) {
    return await Project.findOneAndUpdate(
      { _id: projectId, "milestones.milestoneId": milestoneId },
      { $set: { "milestones.$.status": status } },
      { new: true, session }
    ).lean().exec();
  }

  async incrementMilestoneDisbursed(projectId, milestoneId, amount, session = null) {
        return await Project.findOneAndUpdate(
            { _id: projectId, "milestones.milestoneId": milestoneId },
            { $inc: { "milestones.$.actualDisbursedAmount": amount } },
            { new: true, session }
        ).lean().exec();
    }
}

export default ProjectRepository;