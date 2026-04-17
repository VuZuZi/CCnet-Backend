import mongoose from 'mongoose';

const volunteerSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    skills: {
      type: String,
      required: true,
    },
    motivation: {
      type: String,
      required: true,
    },
    availability: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAW_REQUESTED', 'CANCELLED'],
      default: 'PENDING',
    },
    rejectReason: {
      type: String,
    },
    withdrawReason: {
      type: String,
      default: null,
    },
    withdrawRequestedAt: {
      type: Date,
      default: null,
    },
    withdrawReviewedAt: {
      type: Date,
      default: null,
    },
    withdrawReviewNote: {
      type: String,
      default: null,
    },
    ratingScore: {
      type: Number,
      min: 1,
      max: 5,
    },
    reviewNotes: {
      type: String,
    },
    isCertificateSent: {
      type: Boolean,
      default: false,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

volunteerSchema.index(
  { volunteerId: 1, opportunityId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $nin: ['CANCELLED'] }
    }
  }
);

const Volunteer = mongoose.models.volunteer || mongoose.model('volunteer', volunteerSchema);

export default Volunteer;