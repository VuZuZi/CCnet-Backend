import mongoose from 'mongoose';
import DisbursementRequest from './disbursement-request.model.js';

class DisbursementRequestRepository {
    async create(data, session = null) {
        const docs = await DisbursementRequest.create([data], { session });
        return docs[0].toObject();
    }

    async findById(id, session = null) {
        return await DisbursementRequest.findById(id).session(session).lean().exec();
    }

    async findActiveRequestByMilestone(projectId, milestoneId, session = null) {
        return await DisbursementRequest.findOne({
            projectId,
            milestoneId,
            status: { $in: ['PENDING', 'PARTIALLY_APPROVED', 'APPROVED_PENDING_TRANSFER', 'HOLD'] }
        }).session(session).lean().exec();
    }

    async findAndCountByOrganizer(organizerId, { projectId, status, skip = 0, limit = 10 }) {
        const filter = { organizerId };
        if (projectId) filter.projectId = projectId;
        if (status) filter.status = status;

        const [requests, total] = await Promise.all([
            DisbursementRequest.find(filter)
                .populate('projectId', 'title coverMedia')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            DisbursementRequest.countDocuments(filter).exec()
        ]);

        return { requests, total };
    }

    async findByIdAndOrganizer(id, organizerId, session = null) {
        return await DisbursementRequest.findOne({ _id: id, organizerId })
            .session(session)
            .lean()
            .exec();
    }

    async addApprovalAtomic(id, managerId, approvalData, session = null) {
        return await DisbursementRequest.findOneAndUpdate(
            {
                _id: id,
                status: { $in: ['PENDING', 'PARTIALLY_APPROVED'] },
                'approvals.managerId': { $ne: managerId }
            },
            {
                $push: { approvals: approvalData }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async updateStatusWithPayload(id, newStatus, extraPayload = {}, session = null) {
        return await DisbursementRequest.findByIdAndUpdate(
            id,
            { $set: { status: newStatus, ...extraPayload } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async markAsTransferredAtomic(id, bankTransactionRef, transferredBy, session = null) {
        return await DisbursementRequest.findOneAndUpdate(
            {
                _id: id,
                status: 'APPROVED_PENDING_TRANSFER'
            },
            {
                $set: {
                    status: 'COMPLETED',
                    bankTransactionRef,
                    transferredBy,
                    transferredAt: new Date()
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async getTotalDisbursedForMilestone(projectId, milestoneId, session = null) {
        const result = await DisbursementRequest.aggregate([
            {
                $match: {
                    projectId: new mongoose.Types.ObjectId(projectId),
                    milestoneId: String(milestoneId),
                    status: 'COMPLETED'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$approvedAmount' }
                }
            }
        ]).session(session).exec();

        return result.length > 0 ? result[0].total : 0;
    }
}

export default DisbursementRequestRepository;