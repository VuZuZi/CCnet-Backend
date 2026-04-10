import Transaction from './transaction.model.js';

class TransactionRepository {
    async create(data, session = null) {
        const docs = await Transaction.create([data], { session });
        return docs[0];
    }

    async findByGatewayId(gatewayTransactionId, session = null) {
        return await Transaction.findOne({ gatewayTransactionId }).session(session).lean().exec();
    }

    async updateStatus(id, status, updatePayload = {}, session = null) {
        return await Transaction.findByIdAndUpdate(
            id,
            { $set: { status, ...updatePayload } },
            { new: true, session }
        ).lean().exec();
    }

    async updateStatusIfPending(gatewayTransactionId, newStatus, updatePayload = {}, session = null) {
        return await Transaction.findOneAndUpdate(
            {
                gatewayTransactionId: String(gatewayTransactionId),
                status: 'PENDING'
            },
            { $set: { status: newStatus, ...updatePayload } },
            { new: true, session }
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
            type: { $in: ['DONATION', 'DONATION_FROM_WALLET'] },
            reconciled: false
        }).session(session).lean().exec();
    }

    async findById(id, session = null) {
        return await Transaction.findById(id).session(session).lean().exec();
    }

    async findWalletTransactions(userId, skip = 0, limit = 10) {
        const query = {
            donorRef: userId,
            type: { 
                $in: [
                    'WALLET_DEPOSIT', 
                    'WALLET_WITHDRAWAL', 
                    'DONATION_FROM_WALLET', 
                    'USER_REFUND_REQUEST'
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
}
export default TransactionRepository;