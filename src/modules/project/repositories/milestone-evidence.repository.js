import MilestoneEvidence from '../models/milestone-evidence.model.js';

class MilestoneEvidenceRepository {
    async create(data, session = null) {
        const docs = await MilestoneEvidence.create([data], { session });
        return docs[0];
    }

    async findById(id, session = null) {
        return await MilestoneEvidence.findById(id).session(session).lean().exec();
    }

    async findPendingByMilestone(projectId, milestoneId, session = null) {
        return await MilestoneEvidence.findOne({
            projectId,
            milestoneId,
            status: 'PENDING'
        }).session(session).lean().exec();
    }

    async findApprovedByMilestone(projectId, milestoneId, session = null) {
        return await MilestoneEvidence.findOne({
            projectId,
            milestoneId,
            status: 'APPROVED'
        }).session(session).lean().exec();
    }

    async updateStatus(id, updateData, session = null) {
        return await MilestoneEvidence.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async findPublicApprovedByMilestone(projectId, milestoneId) {
        return await MilestoneEvidence.findOne({
            projectId,
            milestoneId,
            status: 'APPROVED'
        })
        .populate({
            path: 'mediaIds',
            select: 'url originalName mimetype size blurHash width height'
        })
        .lean()
        .exec();
    }

    async findAndCountByOrganizer(organizerId, { projectId, status, skip = 0, limit = 10 }) {
        const filter = { organizerId };
        if (projectId) filter.projectId = projectId;
        if (status) filter.status = status;

        const [evidences, total] = await Promise.all([
            MilestoneEvidence.find(filter)
                .populate('projectId', 'title coverMedia')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            MilestoneEvidence.countDocuments(filter).exec()
        ]);

        return { evidences, total };
    }

    async findByMilestone(projectId, milestoneId, session = null) {
        return await MilestoneEvidence.findOne({
            projectId,
            milestoneId
        }).session(session).lean().exec();
    }
}

export default MilestoneEvidenceRepository;