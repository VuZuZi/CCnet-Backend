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
        return await Wallet.findOneAndUpdate(
            { userId, status: 'ACTIVE' },
            { $inc: { balance: amount } },
            { new: true, runValidators: true, session }
        ).lean().exec();
    }
}

export default WalletRepository;