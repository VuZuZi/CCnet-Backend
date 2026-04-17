import mongoose from 'mongoose';

const webhookAuditLogSchema = new mongoose.Schema({
    provider: { type: String, default: 'SEPAY', index: true },
    bankTransactionRef: { type: String, index: true, sparse: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    headers: { type: mongoose.Schema.Types.Mixed },
    status: {
        type: String,
        enum: ['RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'],
        default: 'RECEIVED',
        index: true
    },
    errorMessage: { type: String },
    processedAt: { type: Date }
}, {
    timestamps: true
});

webhookAuditLogSchema.pre('findOneAndDelete', function (next) {
    next(new Error("CRITICAL: Audit logs are immutable and cannot be deleted."));
});
webhookAuditLogSchema.pre('deleteOne', function (next) {
    next(new Error("CRITICAL: Audit logs are immutable and cannot be deleted."));
});

export default mongoose.model('WebhookAuditLog', webhookAuditLogSchema);