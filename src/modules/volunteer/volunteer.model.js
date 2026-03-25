import mongoose from 'mongoose';

const volunteerSchema = new mongoose.Schema(
  {

    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },

    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
    },

    rejectReason: {
      type: String,
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
      type: String,
    },
  },
  { timestamps: true }
);

// 1 user chỉ apply 1 lần
volunteerSchema.index(
  { volunteerId: 1, opportunityId: 1 },
  { unique: true }
);

const Volunteer =
  mongoose.models.volunteer ||
  mongoose.model('volunteer', volunteerSchema);

export default Volunteer;