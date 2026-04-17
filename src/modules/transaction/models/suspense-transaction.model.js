import mongoose from 'mongoose';

const claimRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    proofImageUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING'
    },
    adminNote: { type: String },
    submittedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date }
}, { _id: true });

const suspenseTransactionSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    bankTransactionRef: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    description: {
        type: String,
        required: true
    },
    receivedAt: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['UNALLOCATED', 'ALLOCATED', 'REFUNDED'],
        default: 'UNALLOCATED',
        index: true
    },
    claimRequests: [claimRequestSchema],
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    targetProjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null
    }
}, {
    timestamps: true,
    optimisticConcurrency: true
});

suspenseTransactionSchema.pre('findOneAndDelete', function (next) {
    next(new Error("CRITICAL: Suspense Transactions are strictly immutable and cannot be deleted."));
});
suspenseTransactionSchema.pre('deleteOne', function (next) {
    next(new Error("CRITICAL: Suspense Transactions are strictly immutable and cannot be deleted."));
});

export default mongoose.model('SuspenseTransaction', suspenseTransactionSchema);