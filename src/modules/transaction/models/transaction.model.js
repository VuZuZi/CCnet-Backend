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
            return ![
                TRANSACTION_TYPES.WALLET_WITHDRAWAL,
                TRANSACTION_TYPES.PLATFORM_FEE,
                TRANSACTION_TYPES.WEB_SUPPORT_DONATION
            ].includes(this.type);
        },
        index: true
    },
    milestoneId: {
        type: String,
        index: true
    },
    donorRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    organizerRef: {
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
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'TRANSFERRED', 'REFUNDED', 'REJECTED'],
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
    next(new Error("CRITICAL_IMMUTABILITY_ERROR: Transactions are strictly immutable and cannot be deleted."));
});

const IMMUTABLE_FIELDS = [
    'amount', 'grossAmount', 'platformFee', 'netAmount',
    'currency', 'projectId', 'milestoneId', 'donorRef', 'organizerRef', 'type', 'gatewayTransactionId'
];

const ONCE_UPDATABLE_FIELDS = ['amount', 'grossAmount', 'platformFee', 'netAmount', 'gatewayTransactionId', 'bankTransactionRef'];

transactionSchema.pre('save', function (next) {
    if (!this.isNew) {
        const isTransitioningToCompleted = this.isModified('status') && this.status === 'COMPLETED';
        for (const field of IMMUTABLE_FIELDS) {
            if (this.isModified(field)) {
                if (isTransitioningToCompleted && ONCE_UPDATABLE_FIELDS.includes(field)) {
                    continue;
                }
                return next(new Error(`CRITICAL_IMMUTABILITY_ERROR: Ledger field '${field}' cannot be modified after creation.`));
            }
        }
    }
    next();
});

transactionSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    const restrictedOperators = ['$set', '$inc', '$unset', '$mul', '$rename'];
    const isTransitioningToCompleted = update.$set && update.$set.status === 'COMPLETED';

    for (const op of restrictedOperators) {
        if (update[op]) {
            for (const field of IMMUTABLE_FIELDS) {
                if (update[op][field] !== undefined) {
                    if (isTransitioningToCompleted && op === '$set' && ONCE_UPDATABLE_FIELDS.includes(field)) continue;
                    return next(new Error(`CRITICAL_IMMUTABILITY_ERROR: Ledger field '${field}' cannot be modified via ${op} operator.`));
                }
            }
        }
    }
    next();
});

export default mongoose.model('Transaction', transactionSchema);
