import Wallet from './wallet.model.js';

class WalletRepository {
    async findByUserId(userId, session = null) {
        let wallet = await Wallet.findOne({ userId }).session(session).lean().exec();
        if (!wallet) {
            const docs = await Wallet.create([{ userId, balance: 0 }], { session });
            wallet = docs[0].toObject();
        }
        return wallet;
    }

    async incrementBalance(userId, amount, session = null) {
        const query = { userId, status: 'ACTIVE' };
        if (amount < 0) {
            query.balance = { $gte: Math.abs(amount) };
        }

        return await Wallet.findOneAndUpdate(
            query,
            { $inc: { balance: amount } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }

    async getTotalSystemWalletBalance(session = null) {
        const result = await Wallet.aggregate([
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]).session(session).exec();

        return result.length > 0 ? result[0].total : 0;
    }

    async bulkUpdateBalances(updates, session = null) {
        if (!updates || updates.length === 0) return;
        const operations = updates.map(u => ({
            updateOne: {
                filter: { userId: u.userId, status: 'ACTIVE' },
                update: { $inc: { balance: u.amount } }
            }
        }));
        return await Wallet.bulkWrite(operations, { session });
    }
}

export default WalletRepository;