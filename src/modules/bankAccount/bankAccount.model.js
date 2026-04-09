import mongoose from 'mongoose';
import { BANK_ACCOUNT_STATUS } from './bankAccount.constant.js';

const bankAccountSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

        bankName: { type: String, required: true, trim: true, maxlength: 100 },
        accountNumber: { type: String, required: true, trim: true, maxlength: 50 },
        accountName: { type: String, required: true, trim: true, maxlength: 150 },

        isVerified: { type: Boolean, default: false },
        microDepositAmount: { type: Number, default: null },

        isCrossLinked: { type: Boolean, default: false },
        crossLinkedToUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

        status: {
            type: String,
            enum: Object.values(BANK_ACCOUNT_STATUS),
            default: BANK_ACCOUNT_STATUS.ACTIVE,
            index: true
        }
    },
    { timestamps: true }
);

bankAccountSchema.index({ accountNumber: 1, bankName: 1 });

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);
export default BankAccount;