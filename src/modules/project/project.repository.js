import mongoose from 'mongoose';
import Project from './project.model.js';
import { PROJECT_STATUS } from './project.constant.js';

const PROJECT_CARD_PROJECTION = {
    title: 1,
    coverMedia: 1,
    category: 1,
    targetAmount: 1,
    currentAmount: 1,
    'location.address': 1,
    isUrgent: 1,
    endDate: 1,
    stats: 1,
    organizerId: 1
};

class ProjectRepository {

    async create(projectData, session = null) {
        const docs = await Project.create([projectData], { session });
        return docs[0];
    }

    async updateById(projectId, updateData, session = null) {
        return await Project.findByIdAndUpdate(
            projectId,
            { $set: updateData },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async transitionStatus(projectId, fromStatus, toStatus, session = null) {
        return await Project.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(projectId),
                status: fromStatus
            },
            { $set: { status: toStatus } },
            { new: true, session }
        ).lean().exec();
    }

    async incrementProjectStats(projectId, increments, session = null) {
        if (!increments['stats.currentVolunteers']) {
            return await Project.findByIdAndUpdate(
                projectId,
                { $inc: increments },
                { new: true, session }
            ).lean().exec();
        }
        return await Project.findByIdAndUpdate(
            projectId,
            [
                {
                    $set: {
                        'stats.currentVolunteers': {
                            $add: [
                                { $ifNull: ['$stats.currentVolunteers', 0] },
                                increments['stats.currentVolunteers']
                            ]
                        }
                    }
                },
                {
                    $set: {
                        isVolunteerFull: {
                            $gte: ['$stats.currentVolunteers', '$stats.targetVolunteers']
                        }
                    }
                }
            ],
            { new: true, session }
        ).lean().exec();
    }

    async findById(projectId, session = null) {
        if (!mongoose.Types.ObjectId.isValid(projectId)) return null;
        return await Project.findById(projectId).session(session).lean().exec();
    }

    async checkExists(projectId) {
        if (!mongoose.Types.ObjectId.isValid(projectId)) return false;
        const project = await Project.exists({ _id: projectId });
        return !!project;
    }

    async findFeaturedProjects(limit = 1) {
        return await Project.find({
            status: PROJECT_STATUS.ACTIVE,
            isUrgent: true,
            endDate: { $gt: new Date() }
        })
            .select(PROJECT_CARD_PROJECTION)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec();
    }

    async findVolunteerProjects(limit = 4) {
        return await Project.find({
            status: PROJECT_STATUS.ACTIVE,
            needsVolunteers: true,
            isVolunteerFull: false
        })
            .select({
                ...PROJECT_CARD_PROJECTION,
                volunteerRoles: 1
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec();
    }

    async findAllProjects({ filter, skip = 0, limit = 10, sort = { createdAt: -1 }, textSearch = null }) {
        const queryFilter = { ...filter, status: PROJECT_STATUS.ACTIVE };

        let finalSort = sort;
        let projection = { ...PROJECT_CARD_PROJECTION };

        if (textSearch) {
            queryFilter.$text = { $search: textSearch };
            projection.score = { $meta: "textScore" };
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
            Project.find(queryFilter)
                .limit(5000)
                .maxTimeMS(2000)
                .countDocuments()
                .exec()
        ]);

        return { projects, total };
    }

    async findByIdWithDetails(projectId) {
        if (!mongoose.Types.ObjectId.isValid(projectId)) return null;
        return await Project.findById(projectId)
            .populate({
                path: 'organizerId',
                select: 'fullName avatar email isVerified'
            })
            .lean()
            .exec();
    }

    async getOrganizerStats(organizerId) {
        const stats = await Project.aggregate([
            { $match: { organizerId: new mongoose.Types.ObjectId(organizerId) } },
            {
                $group: {
                    _id: null,
                    totalFundsRaised: { $sum: "$currentAmount" },
                    activeProjects: {
                        $sum: { $cond: [{ $eq: ["$status", PROJECT_STATUS.ACTIVE] }, 1, 0] }
                    },
                    pendingProjects: {
                        $sum: { $cond: [{ $eq: ["$status", PROJECT_STATUS.PENDING_APPROVAL] }, 1, 0] }
                    }
                }
            }
        ]);
        return stats.length > 0 ? stats[0] : { totalFundsRaised: 0, activeProjects: 0, pendingProjects: 0 };
    }

    async findOrganizerProjects({ organizerId, status, skip = 0, limit = 10 }) {
        const filter = { organizerId: new mongoose.Types.ObjectId(organizerId) };
        if (status && status !== 'ALL') {
            filter.status = status;
        }

        const [projects, total] = await Promise.all([
            Project.find(filter)
                .select('title coverMedia category projectType targetAmount currentAmount status milestones createdAt startDate endDate needsVolunteers volunteerRoles stats location isVolunteerFull')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .maxTimeMS(3000)
                .lean()
                .exec(),
            Project.find(filter).limit(5000).countDocuments().exec()
        ]);

        return { projects, total };
    }

    async updateDraftAtomic(projectId, organizerId, updateData, session = null) {
        return await Project.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(projectId),
                organizerId: new mongoose.Types.ObjectId(organizerId),
                status: PROJECT_STATUS.DRAFT
            },
            { $set: updateData },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }
}

export default ProjectRepository;