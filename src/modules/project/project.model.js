import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    // media_files: {
    //   type: Array,
    //   default: []
    // },
    financialGoal: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: (v) => v ? parseFloat(v.toString()) : 0
    },
    currentAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: (v) => v ? parseFloat(v.toString()) : 0
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'active', 'completed', 'cancelled'],
      default: 'draft'
    },
    startDate: {
      type: Date,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
);

// Index for efficient queries
projectSchema.index({ status: 1, createdAt: -1 });
projectSchema.index({ userId: 1, status: 1 });

const Project = mongoose.model('Project', projectSchema);

export default Project;
