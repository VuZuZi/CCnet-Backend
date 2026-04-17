import mongoose from 'mongoose';
import SuspenseTransaction from '../models/suspense-transaction.model.js';

class SuspenseTransactionRepository {
    async create(data, session = null) {
        const docs = await SuspenseTransaction.create([data], { session });
        return docs[0];
    }

    async findByBankTransactionRef(bankTransactionRef, session = null) {
        return await SuspenseTransaction.findOne({ bankTransactionRef })
            .session(session)
            .lean()
            .exec();
    }

    async updateStatus(id, status, updatePayload = {}, session = null) {
        return await SuspenseTransaction.findByIdAndUpdate(
            id,
            { $set: { status, ...updatePayload } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async getUnallocatedFundsTotal(session = null) {
        const result = await SuspenseTransaction.aggregate([
            { $match: { status: 'UNALLOCATED' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).session(session).exec();

        return result.length > 0 ? result[0].total : 0;
    }

    async findById(id, session = null) {
        return await SuspenseTransaction.findById(id).session(session).lean().exec();
    }

    async addClaimRequest(suspenseId, claimData, session = null) {
        return await SuspenseTransaction.findByIdAndUpdate(
            suspenseId,
            { $push: { claimRequests: claimData } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async updateClaimRequestStatus(suspenseId, claimRequestId, status, adminNote = '', session = null) {
        return await SuspenseTransaction.findOneAndUpdate(
            { _id: suspenseId, 'claimRequests._id': claimRequestId },
            {
                $set: {
                    'claimRequests.$.status': status,
                    'claimRequests.$.adminNote': adminNote,
                    'claimRequests.$.resolvedAt': new Date()
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async findExistingRefs(refs, session = null) {
        const txs = await SuspenseTransaction.find({ bankTransactionRef: { $in: refs } })
            .select('bankTransactionRef')
            .session(session)
            .lean()
            .exec();
        return txs.map(tx => tx.bankTransactionRef);
    }

    async insertMany(dataArray, session = null) {
        const options = session ? { session, ordered: false } : { ordered: false };
        return await SuspenseTransaction.insertMany(dataArray, options);
    }

    async findCandidateForClaim(amount, bankTransactionRef, session = null) {
        const query = { status: 'UNALLOCATED', amount: amount };
        if (bankTransactionRef) {
            query.bankTransactionRef = bankTransactionRef;
        }
        return await SuspenseTransaction.find(query).session(session).lean().exec();
    }

    async findSuspenseList({ status, hasClaim, skip = 0, limit = 10 }) {
        const query = {};
        
        if (status && status !== 'ALL') query.status = status;
        
        if (hasClaim === 'true') {
            query['claimRequests.0'] = { $exists: true };
        } else if (hasClaim === 'false') {
            query.claimRequests = { $size: 0 };
        }

        const [items, total] = await Promise.all([
            SuspenseTransaction.find(query)
                .populate('targetProjectId', 'title')
                .populate('claimRequests.userId', 'fullName email avatar')
                .sort({ receivedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            SuspenseTransaction.countDocuments(query).exec()
        ]);

        return { items, total };
    }

    async countPendingClaimsByUser(userId, session = null) {
        const result = await SuspenseTransaction.aggregate([
            { $match: { 'claimRequests.userId': new mongoose.Types.ObjectId(userId) } },
            { $unwind: '$claimRequests' },
            {
                $match: {
                    'claimRequests.userId': new mongoose.Types.ObjectId(userId),
                    'claimRequests.status': 'PENDING'
                }
            },
            { $count: 'totalPending' }
        ]).session(session).exec();

        return result.length > 0 ? result[0].totalPending : 0;
    }

    async allocateIfUnallocated(suspenseId, claimRequestId, updatePayload, session = null) {
        return await SuspenseTransaction.findOneAndUpdate(
            {
                _id: suspenseId,
                status: 'UNALLOCATED',
                'claimRequests._id': claimRequestId,
                'claimRequests.status': 'PENDING'
            },
            {
                $set: {
                    status: 'ALLOCATED',
                    resolvedBy: updatePayload.resolvedBy,
                    resolvedAt: updatePayload.resolvedAt,
                    targetProjectId: updatePayload.targetProjectId,
                    
                    'claimRequests.$[targetClaim].status': 'APPROVED',
                    'claimRequests.$[targetClaim].adminNote': 'Hình ảnh biên lai hợp lệ. Đã phân bổ.',
                    'claimRequests.$[targetClaim].resolvedAt': updatePayload.resolvedAt,
                    
                    'claimRequests.$[otherClaims].status': 'REJECTED',
                    'claimRequests.$[otherClaims].adminNote': 'Đã từ chối do hệ thống đã phân bổ tiền cho một biên lai tra soát hợp lệ hơn.',
                    'claimRequests.$[otherClaims].resolvedAt': updatePayload.resolvedAt
                }
            },
            {
                arrayFilters: [
                    { 'targetClaim._id': claimRequestId },
                    { 'otherClaims._id': { $ne: claimRequestId }, 'otherClaims.status': 'PENDING' }
                ],
                new: true,
                runValidators: true,
                session
            }
        ).lean().exec();
    }

    async findByBankRefsForReconciliation(refs, session = null) {
        return await SuspenseTransaction.find({ bankTransactionRef: { $in: refs } })
            .select('bankTransactionRef amount status')
            .session(session)
            .lean()
            .exec();
    }
}

export default SuspenseTransactionRepository;