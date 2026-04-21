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
                select: 'url mimetype originalName captureMetadata'
            })
            .populate({
                path: 'financialReport.expenseItems.receiptMediaId',
                select: 'url mimetype originalName'
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
        const existingEvidence = await MilestoneEvidence.findOne({
            projectId,
            milestoneId,
            status: { $in: ['REJECTED', 'REVISION_REQUESTED'] }
        }).session(session).lean().exec();

        if (existingEvidence) {
            const historyEntry = {
                reportContent: existingEvidence.reportContent,
                mediaIds: existingEvidence.mediaIds,
                financialReport: existingEvidence.financialReport,
                status: existingEvidence.status,
                reviewNotes: existingEvidence.reviewNotes,
                reviewedBy: existingEvidence.reviewedBy,
                reviewedAt: existingEvidence.reviewedAt,
                submittedAt: existingEvidence.createdAt
            };

            return await MilestoneEvidence.findByIdAndUpdate(
                existingEvidence._id,
                {
                    $set: payload,
                    $push: { revisionHistory: historyEntry }
                },
                { new: true, runValidators: true, session }
            ).lean().exec();
        }

        try {
            const docs = await MilestoneEvidence.create([payload], { session });
            return docs[0].toObject();
        } catch (error) {
            if (error.code === 11000) return null; // Bắt lỗi Race condition (MongoRetry sẽ lo)
            throw error;
        }
    }

    async findAndCountForAdmin({ skip = 0, limit = 10, status, projectId }, session = null) {
        const filter = {};
        if (status) filter.status = status;
        if (projectId) filter.projectId = projectId;

        const [data, total] = await Promise.all([
            MilestoneEvidence.find(filter)
                .populate('projectId', 'title coverMedia projectType')
                .populate('organizerId', 'fullName avatar email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .session(session)
                .lean()
                .exec(),
            MilestoneEvidence.countDocuments(filter).session(session).exec()
        ]);

        return { data, total };
    }

    async findAllByProject(projectId, session = null) {
        return await MilestoneEvidence.find({ projectId })
            .sort({ createdAt: -1 })
            .session(session)
            .lean()
            .exec();
    }
}

export default MilestoneEvidenceRepository;