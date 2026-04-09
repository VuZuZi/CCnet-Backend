import BankAccount from './bankAccount.model.js';

class BankAccountRepository {
    async create(data, session = null) {
        const options = session ? { session } : {};
        const bankAccounts = await BankAccount.create([data], options);
        return bankAccounts[0].toObject();
    }

    async findById(id) {
        return await BankAccount.findById(id).lean().exec();
    }

    async findByAccountNumber(accountNumber, bankName) {
        return await BankAccount.find({ accountNumber, bankName }).lean().exec();
    }

    async findVerifiedByUserId(userId) {
        return await BankAccount.find({
            userId,
            isVerified: true,
            status: 'ACTIVE'
        }).lean().exec();
    }

    async updateById(id, updateData, session = null) {
        const options = { new: true, runValidators: true };
        if (session) options.session = session;

        return await BankAccount.findByIdAndUpdate(id, { $set: updateData }, options).lean().exec();
    }
}

export default BankAccountRepository;