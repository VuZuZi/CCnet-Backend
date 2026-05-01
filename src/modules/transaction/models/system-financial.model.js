import mongoose from 'mongoose';

const systemFinancialSchema = new mongoose.Schema({
    identifier: {
        type: String,
        required: true,
        unique: true,
        default: 'SYSTEM_MAIN'
    },
    bankBalanceStartOfDay: { type: Number, default: 0 },
    platformFeePendingWithdrawal: {
        type: Number,
        default: 0,
        min: [0, "Quỹ phí sàn không được phép âm"]
    },
    retainedPenaltyFund: {
        type: Number,
        default: 0,
        min: [0, "Quỹ lợi nhuận giữ lại/phí phạt không được phép âm"]
    },
    charityFundBalance: {
        type: Number,
        default: 0,
        min: [0, "Quỹ từ thiện chung không được phép âm"]
    },
    webSupportFundBalance: {
        type: Number,
        default: 0,
        min: [0, "Web support fund cannot be negative"]
    },
    lastReconciledAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    optimisticConcurrency: true
});

export default mongoose.model('SystemFinancial', systemFinancialSchema);
