import mongoose from 'mongoose';
import Transaction from '../models/transaction.model.js';
import { TRANSACTION_TYPES } from '../transaction.constant.js';

class TransactionRepository {
    async create(data, session = null) {
        const docs = await Transaction.create([data], { session });
        return docs[0];
    }

    async findByGatewayId(gatewayTransactionId, session = null) {
        return await Transaction.findOne({ gatewayTransactionId }).session(session).lean().exec();
    }

    async findByBankTransactionRef(bankTransactionRef, session = null) {
        return await Transaction.findOne({ bankTransactionRef }).session(session).lean().exec();
    }

    async updateStatus(id, status, updatePayload = {}, session = null) {
        return await Transaction.findByIdAndUpdate(
            id,
            { $set: { status, ...updatePayload } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async updateStatusIfPending(gatewayTransactionId, newStatus, updatePayload = {}, session = null) {
        return await Transaction.findOneAndUpdate(
            {
                gatewayTransactionId: String(gatewayTransactionId),
                status: 'PENDING'
            },
            { $set: { status: newStatus, ...updatePayload } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async reconcileDonationAtomic(id, session = null) {
        return await Transaction.findOneAndUpdate(
            { _id: id, reconciled: false },
            { $set: { reconciled: true } },
            { new: true, session }
        ).lean().exec();
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

    async findWalletTransactions(userId, skip = 0, limit = 10) {
        const query = {
            donorRef: userId,
            type: {
                $in: [
                    TRANSACTION_TYPES.WALLET_DEPOSIT,
                    TRANSACTION_TYPES.WALLET_WITHDRAWAL,
                    TRANSACTION_TYPES.DONATION_FROM_WALLET,
                    TRANSACTION_TYPES.USER_REFUND_REQUEST
                ]
            }
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            Transaction.countDocuments(query).exec()
        ]);

        return { transactions, total };
    }

    async findUserDonations(userId, skip = 0, limit = 10) {
        const query = {
            donorRef: userId,
            type: { $in: [TRANSACTION_TYPES.DONATION, TRANSACTION_TYPES.DONATION_FROM_WALLET] },
            status: 'COMPLETED'
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .populate('projectId', 'title status coverMedia')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            Transaction.countDocuments(query).exec()
        ]);

        return { transactions, total };
    }

    async findPublicDonorsByProject(projectId, skip = 0, limit = 10) {
        const query = {
            projectId,
            type: { $in: [TRANSACTION_TYPES.DONATION, TRANSACTION_TYPES.DONATION_FROM_WALLET] },
            status: 'COMPLETED'
        };

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .populate('donorRef', 'fullName avatar')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            Transaction.countDocuments(query).exec()
        ]);

        return { transactions, total };
    }

    async expirePendingTransactions(thresholdDate, session = null) {
        return await Transaction.updateMany(
            { status: 'PENDING', createdAt: { $lt: thresholdDate } },
            { $set: { status: 'EXPIRED' } },
            { session }
        ).exec();
    }

    async findExistingRefs(refs, session = null) {
        const txs = await Transaction.find({ bankTransactionRef: { $in: refs } })
            .select('bankTransactionRef')
            .session(session)
            .lean()
            .exec();
        return txs.map(tx => tx.bankTransactionRef);
    }

    async updateDonationMessage(id, donorRef, updateData, session = null) {
        return await Transaction.findOneAndUpdate(
            { _id: id, donorRef: donorRef },
            { $set: updateData },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async markAsUserConfirmed(id, donorRef, session = null) {
        return await Transaction.findOneAndUpdate(
            {
                _id: id,
                donorRef: donorRef,
                status: 'PENDING'
            },
            {
                $set: {
                    userConfirmedPaid: true,
                    userConfirmedAt: new Date()
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
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
                            TRANSACTION_TYPES.DONATION,
                            TRANSACTION_TYPES.DONATION_FROM_WALLET,
                            TRANSACTION_TYPES.USER_REFUND_REQUEST,
                            TRANSACTION_TYPES.REFUND,
                            TRANSACTION_TYPES.RETAINED_DONATION
                        ]
                    },
                    status: 'COMPLETED'
                }
            },
            {
                $group: {
                    _id: "$donorRef",
                    totalNetDonated: { $sum: "$netAmount" }
                }
            },
            {
                $match: {
                    totalNetDonated: { $gt: 0 }
                }
            },
            {
                $project: {
                    donorId: "$_id",
                    totalNetDonated: 1,
                    _id: 0
                }
            }
        ];

        return await Transaction.aggregate(pipeline).session(session).exec();
    }

    async bulkInsert(docs, session = null) {
        if (!docs || docs.length === 0) return [];
        return await Transaction.insertMany(docs, { session, ordered: false });
    }
}
export default TransactionRepository;