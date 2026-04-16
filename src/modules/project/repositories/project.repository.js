import mongoose from "mongoose";
import Project from "../project.model.js";
import {
  PUBLIC_PROJECT_STATUSES,
  PROJECT_STATUS,
  WORKSPACE_CANCELLED_STATUSES,
  WORKSPACE_COMPLETED_STATUSES,
} from "../project.constant.js";

const PROJECT_CARD_PROJECTION = {
  title: 1,
  coverMedia: 1,
  category: 1,
  targetAmount: 1,
  currentAmount: 1,
  "location.address": 1,
  isUrgent: 1,
  endDate: 1,
  stats: 1,
  organizerId: 1,
  needsVolunteers: 1,
  isVolunteerFull: 1,
  projectType: 1,
  volunteerRoles: 1,
  status: 1,
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

const buildPublicProjectsFilter = (filter = {}) => ({
  ...filter,
  status: { $in: PUBLIC_PROJECT_STATUSES },
});

class ProjectRepository {
  async create(projectData, session = null) {
    const docs = await Project.create([projectData], { session });
    return docs[0];
  }

  async updateById(projectId, updateData, session = null) {
    return await Project.findByIdAndUpdate(
      projectId,
      { $set: updateData },
      { new: true, runValidators: true, session },
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
      { new: true, session },
    )
      .lean()
      .exec();
  }

  async incrementProjectStats(projectId, increments, session = null) {
    if (!increments["stats.currentVolunteers"]) {
      return await Project.findByIdAndUpdate(
        projectId,
        { $inc: increments },
        { new: true, session },
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
              $add: [
                { $ifNull: ["$stats.currentVolunteers", 0] },
                increments["stats.currentVolunteers"],
              ],
            },
          },
        },
        {
          $set: {
            isVolunteerFull: {
              $gte: ["$stats.currentVolunteers", "$stats.targetVolunteers"],
            },
          },
        },
      ],
      { new: true, session },
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
      .sort({ createdAt: -1 })
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
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async findAllProjects({
    filter = {},
    skip = 0,
    limit = 10,
    sort = { createdAt: -1 },
    textSearch = null,
  }) {
    const queryFilter = buildPublicProjectsFilter(filter);
    let finalSort = sort;
    let projection = { ...PROJECT_CARD_PROJECTION };

    if (textSearch) {
      queryFilter.$text = { $search: textSearch };
      projection = {
        ...projection,
        score: { $meta: "textScore" },
      };
      finalSort = { score: { $meta: "textScore" } };
    }

    const [projects, total] = await Promise.all([
      Project.find(queryFilter)
        .select(projection)
        .sort(finalSort)
        .skip(skip)
        .limit(limit)
        .maxTimeMS(3000)
        .lean()
        .exec(),
      Project.countDocuments(queryFilter).maxTimeMS(2000).exec(),
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

    return stats.length > 0
      ? stats[0]
      : {
          totalFundsRaised: 0,
          activeProjects: 0,
          pendingProjects: 0,
        };
  }

  async findOrganizerProjects({ organizerId, status, skip = 0, limit = 10 }) {
    const filter = {
      organizerId: toObjectId(organizerId),
    };

    const normalizedStatusFilter = buildWorkspaceStatusFilter(status);
    if (normalizedStatusFilter) {
      filter.status = normalizedStatusFilter;
    }

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .select(ORGANIZER_PROJECT_PROJECTION)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .maxTimeMS(3000)
        .lean()
        .exec(),
      Project.countDocuments(filter).exec(),
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
      { new: true, runValidators: true, session },
    )
      .lean()
      .exec();
  }
}

export default ProjectRepository;