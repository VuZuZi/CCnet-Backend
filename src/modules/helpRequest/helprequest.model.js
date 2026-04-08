import mongoose from 'mongoose';

const helpRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    story: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    category: {
      type: String,
      required: true,
      enum: ['Y_TE', 'GIAO_DUC', 'THIEN_TAI', 'XAY_DUNG', 'MOI_TRUONG', 'KHAC'],
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
      address: {
        type: String,
        trim: true,
      },
    },
    urgencyLevel: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    amountNeeded: {
      type: Number,
      default: 0,
      min: 0,
    },
    evidences: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
        mediaType: {
          type: String,
          enum: ['image', 'video', 'document'],
          default: 'image',
        },
        originalName: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      maxlength: 1000,
    },
    assignedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedOrganizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    linkedProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

helpRequestSchema.index({ location: '2dsphere' });
helpRequestSchema.index({ createdAt: -1 });
helpRequestSchema.index({ status: 1, urgencyLevel: 1 });
helpRequestSchema.index({ requesterId: 1, isDeleted: 1 });

helpRequestSchema.virtual('requester', {
  ref: 'User',
  localField: 'requesterId',
  foreignField: '_id',
  justOne: true,
});

helpRequestSchema.virtual('verifier', {
  ref: 'User',
  localField: 'verifiedBy',
  foreignField: '_id',
  justOne: true,
});

helpRequestSchema.virtual('assignedOrganizer', {
  ref: 'User',
  localField: 'assignedOrganizerId',
  foreignField: '_id',
  justOne: true,
});

helpRequestSchema.virtual('linkedProject', {
  ref: 'Project',
  localField: 'linkedProjectId',
  foreignField: '_id',
  justOne: true,
});

const HelpRequest = mongoose.model('HelpRequest', helpRequestSchema);

export default HelpRequest;
