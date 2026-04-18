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
                select: 'url originalName mimetype size blurHash width height captureMetadata'
            })
            .populate({
                path: 'financialReport.expenseItems.receiptMediaId',
                select: 'url originalName mimetype size blurHash width height captureMetadata'
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

    async upsertEvidenceAtomic(projectId, milestoneId, payload, session = null) {
        const updatedEvidence = await MilestoneEvidence.findOneAndUpdate(
            {
                projectId,
                milestoneId,
                status: { $in: ['REJECTED', 'REVISION_REQUESTED'] }
            },
            { $set: payload },
            { new: true, runValidators: true, session }
        ).lean().exec();

        if (updatedEvidence) return updatedEvidence;

        try {
            const docs = await MilestoneEvidence.create([payload], { session });
            return docs[0].toObject();
        } catch (error) {
            if (error.code === 11000) return null; 
            throw error;
        }
    }
}

export default MilestoneEvidenceRepository;