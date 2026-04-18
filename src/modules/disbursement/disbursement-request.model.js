import mongoose from 'mongoose';

const approvalTrackerSchema = new mongoose.Schema(
    {
        managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        decision: { type: String, enum: ['APPROVED', 'REJECTED', 'HOLD'], required: true },
        note: { type: String, trim: true },
        approvedAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const bankAccountSnapshotSchema = new mongoose.Schema(
    {
        bankName: { type: String, required: true },
        accountNumber: { type: String, required: true },
        accountName: { type: String, required: true },
        bin: { type: String }
    },
    { _id: false }
);

const disbursementRequestSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project',
            required: true,
            index: true
        },
        milestoneId: {
            type: String,
            required: true
        },
        organizerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        type: {
            type: String,
            enum: ['FULL', 'SUPPLEMENTAL'],
            default: 'FULL'
        },
        requestedAmount: { type: Number, required: true, min: 0 },
        approvedAmount: { type: Number, default: null, min: 0 },
        disputedAmount: { type: Number, default: 0, min: 0 },
        disputedAmountStatus: {
            type: String,
            enum: ['PENDING_RESUBMIT', 'WAIVED', 'RESUBMITTED'],
            default: null
        },

        parentRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DisbursementRequest',
            default: null
        },

        bankAccountSnapshot: {
            type: bankAccountSnapshotSchema,
            required: true
        },

        requiredApprovals: { type: Number, enum: [1, 2, 3], required: true },
        approvals: [approvalTrackerSchema],

        status: {
            type: String,
            enum: [
                'PENDING',
                'PARTIALLY_APPROVED',
                'APPROVED_PENDING_TRANSFER',
                'COMPLETED',
                'REJECTED',
                'HOLD'
            ],
            default: 'PENDING',
            index: true
        },

        bankTransactionRef: {
            type: String,
            sparse: true,
            unique: true
        },
        transferredAt: { type: Date, default: null },
        transferredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    { timestamps: true }
);

disbursementRequestSchema.index({ status: 1, createdAt: 1 });
disbursementRequestSchema.index({ projectId: 1, milestoneId: 1, status: 1 });

disbursementRequestSchema.index(
    { projectId: 1, milestoneId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: { $in: ['PENDING', 'PARTIALLY_APPROVED', 'APPROVED_PENDING_TRANSFER', 'HOLD'] }
        },
        name: 'unique_active_disbursement_per_milestone'
    }
);

export default mongoose.model('DisbursementRequest', disbursementRequestSchema);