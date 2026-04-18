import mongoose from 'mongoose';

const eventOutboxSchema = new mongoose.Schema(
    {
        eventName: { type: String, required: true, index: true },
        payload: { type: mongoose.Schema.Types.Mixed, required: true },
        status: {
            type: String,
            enum: ['PENDING', 'PROCESSED', 'FAILED'],
            default: 'PENDING',
            index: true
        },
        errorMsg: { type: String, default: null }
    },
    { timestamps: true }
);

eventOutboxSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('EventOutbox', eventOutboxSchema);