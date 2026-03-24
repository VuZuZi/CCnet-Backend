import mongoose from 'mongoose';
import { ORGANIZER_REQUEST_STATUS, ORGANIZATION_TYPE } from './organizerRequest.constant.js';

const documentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, default: 0, min: 0 },
    url: { type: String, default: '' },
    dataUrl: { type: String, default: '' }, 
  },
  { _id: false }
);

const organizerRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    fullNameSnapshot: { type: String, required: true, trim: true, maxlength: 150 },
    emailSnapshot: { type: String, required: true, trim: true, maxlength: 150 },
    phoneSnapshot: { type: String, default: '', trim: true, maxlength: 30 },
    locationSnapshot: { type: String, default: '', trim: true, maxlength: 150 },

    organizationName: { type: String, required: true, trim: true, maxlength: 200 },
    organizationType: {
      type: String,
      enum: Object.values(ORGANIZATION_TYPE),
      required: true,
      default: ORGANIZATION_TYPE.OTHER,
    },
    organizationWebsite: { type: String, default: '', trim: true, maxlength: 255 },

    idCardFront: { type: documentSchema, required: true },   
    idCardBack: { type: documentSchema, required: true },    
    businessLicense: { type: documentSchema, default: null }, 
    bankProof: { type: documentSchema, default: null },       

    bankName: { type: String, required: true, trim: true, maxlength: 100 },
    bankAccountNumber: { type: String, required: true, trim: true, maxlength: 50 },
    bankAccountName: { type: String, required: true, trim: true, maxlength: 150 },

    notes: { type: String, default: '', trim: true, maxlength: 1000 },

    aiRiskScore: { type: Number, min: 0, max: 100, default: 0 },

    status: {
      type: String,
      enum: Object.values(ORGANIZER_REQUEST_STATUS),
      default: ORGANIZER_REQUEST_STATUS.PENDING,
      index: true,
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewReason: { type: String, default: '', trim: true, maxlength: 1000 },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },

    resubmissionCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
  }
);

organizerRequestSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: ORGANIZER_REQUEST_STATUS.PENDING,
    },
  }
);

const OrganizerRequest = mongoose.model('OrganizerRequest', organizerRequestSchema);
export default OrganizerRequest;