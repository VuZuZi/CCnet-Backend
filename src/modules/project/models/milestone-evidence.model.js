import mongoose from 'mongoose';

const expenseItemSchema = new mongoose.Schema({
    itemName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true },
    receiptMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null }
}, { _id: false });

const financialReportSchema = new mongoose.Schema(
    {
        spentAmount: { type: Number, required: true, min: 0 },
        unspentAmount: { type: Number, required: true, min: 0 },
        expenseItems: { type: [expenseItemSchema], default: [] },
        note: { type: String, trim: true }
    },
    { _id: false }
);

const revisionHistorySchema = new mongoose.Schema({
    reportContent: String,
    mediaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
    financialReport: financialReportSchema,
    status: String,
    reviewNotes: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    submittedAt: Date
}, { _id: false });

const milestoneEvidenceSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project',
            required: true,
            index: true
        },
        milestoneId: {
            type: String,
            required: true,
            index: true
        },
        organizerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        reportContent: {
            type: String,
            required: true,
            trim: true
        },
        mediaIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Media'
        }],
        financialReport: {
            type: financialReportSchema,
            default: null
        },

        revisionHistory: { type: [revisionHistorySchema], default: [] },
        
        status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'],
            default: 'PENDING',
            index: true
        },
        reviewNotes: {
            type: String,
            default: null
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

milestoneEvidenceSchema.index({ projectId: 1, status: 1 });
milestoneEvidenceSchema.index(
    { projectId: 1, milestoneId: 1 },
    { unique: true }
);

export default mongoose.model('MilestoneEvidence', milestoneEvidenceSchema);