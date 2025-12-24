import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['refresh'],
      default: 'refresh'
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } 
    }
  },
  {
    timestamps: true
  }
);

tokenSchema.index({ userId: 1, token: 1 });

const Token = mongoose.model('Token', tokenSchema);

export default Token;