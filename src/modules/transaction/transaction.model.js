import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
            'DONATION', 'REFUND', 'DISBURSEMENT', 'PLATFORM_FEE', 
            'SURPLUS_CARRYOVER', 'SURPLUS_DONATION', 'DISBURSEMENT_REVERSAL',
            'WALLET_DEPOSIT', 'WALLET_WITHDRAWAL', 'DONATION_FROM_WALLET', 'USER_REFUND_REQUEST'
        ],
        required: true,
        index: true
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'VND' },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: function() {
            return this.type !== 'WALLET_WITHDRAWAL'; 
        },
        index: true
    },
    donorRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    organizerRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    gatewayTransactionId: {
        type: String,
        unique: true,
        sparse: true
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

    deviceFingerprint: { type: String },
    ipAddress: { type: String },
    reconciled: { type: Boolean, default: false }
}, {
    timestamps: true
});

transactionSchema.pre('findOneAndDelete', function (next) {
    next(new Error("CRITICAL: Transactions are strictly immutable and cannot be deleted."));
});
transactionSchema.pre('deleteOne', function (next) {
    next(new Error("CRITICAL: Transactions are strictly immutable and cannot be deleted."));
});

export default mongoose.model('Transaction', transactionSchema);