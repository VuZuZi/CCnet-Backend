import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    balance: {
        type: Number,
        default: 0,
        min: [0, "Số dư ví không đủ để thực hiện giao dịch"]
    },
    currency: { type: String, default: 'VND' },
    status: {
        type: String,
        enum: ['ACTIVE', 'LOCKED'],
        default: 'ACTIVE'
    }
}, {
    timestamps: true
});

export default mongoose.model('Wallet', walletSchema);