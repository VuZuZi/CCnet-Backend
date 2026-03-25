// backend/src/modules/volunteer/volunteer.model.js
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
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ✅ Partial Unique Index - chỉ áp dụng cho status KHÔNG phải CANCELLED
volunteerSchema.index(
  { volunteerId: 1, opportunityId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $nin: ['CANCELLED'] }  // Chỉ unique khi status không phải CANCELLED
    }
  }
);

const Volunteer = mongoose.models.volunteer || mongoose.model('volunteer', volunteerSchema);

export default Volunteer;