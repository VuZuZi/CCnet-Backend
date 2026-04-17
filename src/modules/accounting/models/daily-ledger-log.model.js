import mongoose from 'mongoose';

const mismatchSchema = new mongoose.Schema({
    ref: { type: String, required: true },
    bankAmount: { type: Number, required: true },
    dbAmount: { type: Number, required: true }
}, { _id: false });

const breakdownSchema = new mongoose.Schema({
    matchedIn: { type: Number, default: 0 },
    matchedOut: { type: Number, default: 0 },
    missingInDbRefs: [{ type: String }],
    missingInBankRefs: [{ type: String }],
    amountMismatches: [mismatchSchema],
    message: { type: String }
}, { _id: false });

const dailyLedgerLogSchema = new mongoose.Schema({
    recordDate: {
        type: Date,
        required: true,
        index: true
    },
    openingBalance: { type: Number, required: true },
    totalIn: { type: Number, required: true },
    totalOut: { type: Number, required: true },
    closingBalance: { type: Number, required: true },
    internalDbBalance: { type: Number, required: true },
    status: {
        type: String,
        enum: ['MATCH', 'DISCREPANCY'],
        required: true,
        index: true
    },
    discrepancyAmount: { type: Number, default: 0 },
    breakdown: { type: breakdownSchema, default: () => ({}) }
}, {
    timestamps: true
});

const preventModification = function (next) {
    next(new Error("CRITICAL: Sổ cái kiểm toán là bất biến. Không thể xóa hoặc sửa đổi sau khi chốt sổ."));
};

dailyLedgerLogSchema.pre('findOneAndDelete', preventModification);
dailyLedgerLogSchema.pre('deleteOne', preventModification);
dailyLedgerLogSchema.pre('updateOne', preventModification);
dailyLedgerLogSchema.pre('updateMany', preventModification);

export default mongoose.model('DailyLedgerLog', dailyLedgerLogSchema);