import mongoose from 'mongoose';
import Transaction from '../models/transaction.model.js';
import { TRANSACTION_TYPES } from '../transaction.constant.js';

class TransactionRepository {
    async _findAndSaveAtomic(query, updateFn, session = null) {
        const doc = await Transaction.findOne(query).session(session).exec();
        if (!doc) return null;
        
        updateFn(doc);
        await doc.save({ session });
        
        return doc.toObject();
    }

    async create(data, session = null) {
        const docs = await Transaction.create([data], { session });
        return docs[0].toObject();
    }

    async findByGatewayId(gatewayTransactionId, session = null) {
        return await Transaction.findOne({ gatewayTransactionId }).session(session).lean().exec();
    }

    async findByBankTransactionRef(bankTransactionRef, session = null) {
        return await Transaction.findOne({ bankTransactionRef }).session(session).lean().exec();
    }

    async updateStatus(id, status, updatePayload = {}, session = null) {
        return await this._findAndSaveAtomic(
            { _id: id },
            (doc) => {
                doc.status = status;
                Object.keys(updatePayload).forEach(key => {
                    if (updatePayload[key] !== undefined) doc[key] = updatePayload[key];
                });
            },
            session
        );
    }

    async updateStatusIfPending(gatewayTransactionId, newStatus, updatePayload = {}, session = null) {
        return await this._findAndSaveAtomic(
            { gatewayTransactionId: String(gatewayTransactionId), status: 'PENDING' },
            (doc) => {
                doc.status = newStatus;
                Object.keys(updatePayload).forEach(key => {
                    if (updatePayload[key] !== undefined) doc[key] = updatePayload[key];
                });
            },
            session
        );
    }

    async reconcileDonationAtomic(id, session = null) {
        return await this._findAndSaveAtomic(
            { _id: id, reconciled: false },
            (doc) => {
                doc.reconciled = true;
            },
            session
        );
    }

    async updateDonationMessage(id, donorRef, updateData, session = null) {
        return await this._findAndSaveAtomic(
            { _id: id, donorRef: donorRef },
            (doc) => {
                if (updateData.message !== undefined) doc.message = updateData.message;
                if (updateData.isAnonymous !== undefined) doc.isAnonymous = updateData.isAnonymous;
            },
            session
        );
    }

    async markAsUserConfirmed(id, donorRef, session = null) {
        return await this._findAndSaveAtomic(
            { _id: id, donorRef: donorRef, status: 'PENDING' },
            (doc) => {
                doc.userConfirmedPaid = true;
                doc.userConfirmedAt = new Date();
            },
            session
        );
    }

    async expirePendingTransactions(thresholdDate, session = null) {
        return await Transaction.updateMany(
            { status: 'PENDING', createdAt: { $lt: thresholdDate } },
            { $set: { status: 'EXPIRED' } },
            { session }
        ).exec();
    }

    async findCompletedDonationsByProject(projectId, session = null) {
        return await Transaction.find({
            projectId,
            status: 'COMPLETED',
            type: { $in: [TRANSACTION_TYPES.DONATION, TRANSACTION_TYPES.DONATION_FROM_WALLET] },
            reconciled: false
        }).session(session).lean().exec();
    }

    async findById(id, session = null) {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        return await Transaction.findById(id).session(session).lean().exec();
    }

    async findRefundRequestBySourceTransaction(sourceTransactionId, session = null) {
        if (!mongoose.Types.ObjectId.isValid(sourceTransactionId)) return null;

        return await Transaction.findOne({
            type: TRANSACTION_TYPES.USER_REFUND_REQUEST,
            'gatewayResponse.sourceTransactionId': String(sourceTransactionId),
            status: { $in: ['PENDING', 'COMPLETED'] }
        }).session(session).lean().exec();
    }

    async findRefundRequestsForAdmin({ skip = 0, limit = 10, status = 'PENDING' } = {}, session = null) {
        const filter = {
            type: TRANSACTION_TYPES.USER_REFUND_REQUEST
        };

        if (status && status !== 'ALL') {
            filter.status = status;
        }

        const [requests, total] = await Promise.all([
            Transaction.find(filter)
                .populate('donorRef', 'fullName email avatar')
                .populate('projectId', 'title status')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .session(session)
                .lean()
                .exec(),
            Transaction.countDocuments(filter).session(session).exec()
        ]);

        return { requests, total };
    }

    async findWalletTransactions(userId, skip = 0, limit = 10) {
        const query = {
            donorRef: userId,
            $or: [
                {
                    type: {
                        $in: [
                            TRANSACTION_TYPES.WALLET_DEPOSIT,
                            TRANSACTION_TYPES.WALLET_WITHDRAWAL,
                            TRANSACTION_TYPES.DONATION_FROM_WALLET,
                        ]
                    }
                },
                {
                    type: TRANSACTION_TYPES.USER_REFUND_REQUEST,
                    status: 'COMPLETED'
                }
            ]
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
            Transaction.countDocuments(query).exec()
        ]);
        return { transactions, total };
    }

    async findUserDonations(userId, skip = 0, limit = 10) {
        const query = {
            donorRef: userId,
            type: { $in: [TRANSACTION_TYPES.DONATION, TRANSACTION_TYPES.DONATION_FROM_WALLET] },
            status: { $in: ['COMPLETED', 'REFUNDED'] }
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(query).populate('projectId', 'title status coverMedia').sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
            Transaction.countDocuments(query).exec()
        ]);
        return { transactions, total };
    }

    async findRefundRequestsBySourceTransactionIds(sourceTransactionIds = [], session = null) {
        if (!Array.isArray(sourceTransactionIds) || sourceTransactionIds.length === 0) return [];

        const normalizedIds = sourceTransactionIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => String(id));

        if (normalizedIds.length === 0) return [];

        return await Transaction.find({
            type: TRANSACTION_TYPES.USER_REFUND_REQUEST,
            'gatewayResponse.sourceTransactionId': { $in: normalizedIds }
        }).session(session).lean().exec();
    }

    async findPublicDonorsByProject(projectId, skip = 0, limit = 10) {
        const query = {
            projectId,
            type: { $in: [TRANSACTION_TYPES.DONATION, TRANSACTION_TYPES.DONATION_FROM_WALLET] },
            status: 'COMPLETED'
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(query).populate('donorRef', 'fullName avatar').sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
            Transaction.countDocuments(query).exec()
        ]);
        return { transactions, total };
    }

    async findExistingRefs(refs, session = null) {
        const txs = await Transaction.find({ bankTransactionRef: { $in: refs } })
            .select('bankTransactionRef')
            .session(session).lean().exec();
        return txs.map(tx => tx.bankTransactionRef);
    }

    async findByBankRefsForReconciliation(refs, session = null) {
        return await Transaction.find({ bankTransactionRef: { $in: refs } })
            .select('bankTransactionRef grossAmount status type amount')
            .session(session).lean().exec();
    }

    async findOutboundTransactionsForDate(startOfDay, endOfDay, session = null) {
        return await Transaction.find({
            type: { $in: [TRANSACTION_TYPES.DISBURSEMENT, TRANSACTION_TYPES.REFUND, TRANSACTION_TYPES.WALLET_WITHDRAWAL] },
            status: { $in: ['COMPLETED', 'TRANSFERRED'] },
            updatedAt: { $gte: startOfDay, $lte: endOfDay }
        }).select('amount grossAmount type status').session(session).lean().exec();
    }

    async getDonorContributionSummary(projectId, session = null) {
        if (!mongoose.Types.ObjectId.isValid(projectId)) return [];
        const pipeline = [
            {
                $match: {
                    projectId: new mongoose.Types.ObjectId(projectId),
                    type: {
                        $in: [
                            TRANSACTION_TYPES.DONATION, TRANSACTION_TYPES.DONATION_FROM_WALLET,
                            TRANSACTION_TYPES.USER_REFUND_REQUEST, TRANSACTION_TYPES.REFUND, TRANSACTION_TYPES.RETAINED_DONATION
                        ]
                    },
                    status: 'COMPLETED'
                }
            },
            { $group: { _id: "$donorRef", totalNetDonated: { $sum: "$netAmount" } } },
            { $match: { totalNetDonated: { $gt: 0 } } },
            { $project: { donorId: "$_id", totalNetDonated: 1, _id: 0 } }
        ];
        return await Transaction.aggregate(pipeline).session(session).exec();
    }

    async bulkInsert(docs, session = null) {
        if (!docs || docs.length === 0) return [];
        return await Transaction.insertMany(docs, { session, ordered: false });
    }

    async findPublicDisbursementsByProject(projectId, skip = 0, limit = 10, session = null) {
        const filter = {
            projectId: new mongoose.Types.ObjectId(projectId),
            type: TRANSACTION_TYPES.DISBURSEMENT,
            status: 'COMPLETED'
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(filter)
                .select('amount currency gatewayTransactionId createdAt status organizerRef milestoneId')
                .populate('organizerRef', 'fullName avatar')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .session(session)
                .lean()
                .exec(),
            Transaction.countDocuments(filter).session(session).exec()
        ]);

        return { transactions, total };
    }
}
export default TransactionRepository;