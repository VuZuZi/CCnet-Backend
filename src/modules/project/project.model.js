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
      type: String,
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
      trim: true,
      default: ''
    },
    financialGoal: {
      type: mongoose.Types.Decimal128,
      default: 0
    },
    currentAmount: {
      type: mongoose.Types.Decimal128,
      default: 0
    },
    status: {
      type: String,
      enum: ['ongoing', 'completed'],
      default: 'ongoing'
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    participants: [{
      type: String
    }]
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

projectSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.financialGoal) {
    obj.financialGoal = parseFloat(obj.financialGoal.toString());
  }
  if (obj.currentAmount) {
    obj.currentAmount = parseFloat(obj.currentAmount.toString());
  }
  return obj;
};

const Project = mongoose.model('Project', projectSchema);
export default Project;
