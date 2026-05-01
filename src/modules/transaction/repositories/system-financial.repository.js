import SystemFinancial from '../models/system-financial.model.js';

class SystemFinancialRepository {
    async getSystemRecord(session = null) {
        return await SystemFinancial.findOneAndUpdate(
            { identifier: 'SYSTEM_MAIN' },
            {
                $setOnInsert: {
                    identifier: 'SYSTEM_MAIN',
                    bankBalanceStartOfDay: 0,
                    platformFeePendingWithdrawal: 0,
                    retainedPenaltyFund: 0,
                    charityFundBalance: 0,
                    webSupportFundBalance: 0
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true, session }
        ).lean().exec();
    }

    async updateBalanceStartOfDay(balance, session = null) {
        return await SystemFinancial.findOneAndUpdate(
            { identifier: 'SYSTEM_MAIN' },
            {
                $set: {
                    bankBalanceStartOfDay: balance,
                    lastReconciledAt: new Date()
                }
            },
            { new: true, session }
        ).lean().exec();
    }

    async incrementSystemFunds(feeAmount = 0, penaltyAmount = 0, session = null) {
        return await SystemFinancial.findOneAndUpdate(
            { identifier: 'SYSTEM_MAIN' },
            {
                $inc: {
                    platformFeePendingWithdrawal: feeAmount,
                    retainedPenaltyFund: penaltyAmount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async incrementCharityFund(amount, session = null) {
        return await SystemFinancial.findOneAndUpdate(
            { identifier: 'SYSTEM_MAIN' },
            {
                $inc: {
                    charityFundBalance: amount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async incrementWebSupportFund(amount, session = null) {
        return await SystemFinancial.findOneAndUpdate(
            { identifier: 'SYSTEM_MAIN' },
            {
                $inc: {
                    webSupportFundBalance: amount
                }
            },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }
}

export default SystemFinancialRepository;
