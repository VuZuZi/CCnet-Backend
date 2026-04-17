import mongoose from 'mongoose';
import { TRANSACTION_TYPES } from '../transaction.constant.js';

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: Object.values(TRANSACTION_TYPES),
        required: true,
        index: true
    },
    amount: { type: Number, required: true, min: 1 },
    grossAmount: { type: Number, min: 0 },
    platformFee: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true },
    currency: { type: String, default: 'VND' },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: function () {
            return this.type !== TRANSACTION_TYPES.WALLET_WITHDRAWAL;
        },
        index: true
    },
    donorRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },

    gatewayTransactionId: {
        type: String,
        unique: true,
        sparse: true
    },
    bankTransactionRef: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    gatewayResponse: {
        type: mongoose.Schema.Types.Mixed
    },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'TRANSFERRED'],
        default: 'PENDING',
        index: true
    },
    isAnonymous: { type: Boolean, default: false },
    message: { type: String, maxlength: 500 },
    userConfirmedPaid: { type: Boolean, default: false },
    userConfirmedAt: { type: Date, default: null },
    reconciled: { type: Boolean, default: false }
}, {
    timestamps: true,
    optimisticConcurrency: true
});

transactionSchema.pre(['findOneAndDelete', 'deleteOne', 'deleteMany'], function (next) {
    next(new Error("CRITICAL: Transactions are strictly immutable and cannot be deleted."));
});

const IMMUTABLE_FIELDS = ['amount', 'grossAmount', 'platformFee', 'netAmount', 'currency', 'projectId', 'donorRef', 'type'];

export default mongoose.model('Transaction', transactionSchema);