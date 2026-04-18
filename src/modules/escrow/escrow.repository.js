import EscrowAccount from "./escrow.model.js";

class EscrowRepository {
    async create(data, session = null) {
        const docs = await EscrowAccount.create([data], { session });
        return docs[0];
    }

    async findByProjectId(projectId, session = null) {
        return await EscrowAccount.findOne({ projectId })
            .session(session)
            .lean()
            .exec();
    }

    async incrementBalance(projectId, amount, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            { projectId },
            {
                $inc: {
                    availableBalance: amount,
                    totalDeposited: amount > 0 ? amount : 0
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async recordRefund(projectId, amount, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            { projectId },
            {
                $inc: {
                    availableBalance: -amount,
                    completedRefunds: amount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async processUserRefundWithFee(projectId, originalAmount, refundAmount, penaltyFee, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            { projectId },
            {
                $inc: {
                    availableBalance: -refundAmount,
                    completedRefunds: refundAmount,
                    retainedDonations: penaltyFee
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async getSystemTotalEscrow(session = null) {
        const result = await EscrowAccount.aggregate([
            { $group: { _id: null, total: { $sum: '$availableBalance' } } }
        ]).session(session).exec();

        return result.length > 0 ? result[0].total : 0;
    }

    // async recordDisbursement(projectId, amount, session = null) {
    //     return await EscrowAccount.findOneAndUpdate(
    //         {
    //             projectId: projectId,
    //             availableBalance: { $gte: amount }
    //         },
    //         {
    //             $inc: {
    //                 availableBalance: -amount,
    //                 totalDisbursed: amount
    //             }
    //         },
    //         { new: true, runValidators: true, session }
    //     ).lean().exec();
    // }

    async reserveDisbursement(projectId, amount, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            {
                projectId,
                availableBalance: { $gte: amount }
            },
            {
                $inc: {
                    availableBalance: -amount,
                    pendingDisbursementAmount: amount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async commitDisbursement(projectId, amount, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            {
                projectId,
                pendingDisbursementAmount: { $gte: amount }
            },
            {
                $inc: {
                    pendingDisbursementAmount: -amount,
                    totalDisbursed: amount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async releaseDisbursement(projectId, amount, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            {
                projectId,
                pendingDisbursementAmount: { $gte: amount }
            },
            {
                $inc: {
                    pendingDisbursementAmount: -amount,
                    availableBalance: amount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async sweepSurplus(projectId, amount, session = null) {
        return await EscrowAccount.findOneAndUpdate(
            { projectId },
            { $inc: { availableBalance: -amount } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }
}

export default EscrowRepository;