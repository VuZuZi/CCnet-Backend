import mongoose from "mongoose";
import {
  ORGANIZER_REQUEST_STATUS,
  ORGANIZATION_TYPE,
  ORGANIZATION_LEGAL_TYPE,
} from "./organizerRequest.constant.js";

const pointLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      default: undefined,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, default: 0, min: 0 },
    url: { type: String, trim: true, default: undefined },
    dataUrl: { type: String, trim: true, default: undefined },
  },
  { _id: false }
);

const organizerRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fullNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    emailSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    phoneSnapshot: { type: String, default: "", trim: true, maxlength: 30 },
    locationSnapshot: { type: pointLocationSchema, default: null },

    organizationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    organizationType: {
      type: String,
      enum: Object.values(ORGANIZATION_TYPE),
      required: true,
      default: ORGANIZATION_TYPE.OTHER,
    },
    organizationWebsite: {
      type: String,
      default: "",
      trim: true,
      maxlength: 255,
    },

    organizationLegalType: {
      type: String,
      enum: Object.values(ORGANIZATION_LEGAL_TYPE),
      default: undefined,
    },
    taxCode: {
      type: String,
      trim: true,
      default: undefined,
    },
    legalRegistrationNumber: {
      type: String,
      trim: true,
      default: undefined,
    },
    activityDescription: {
      type: String,
      trim: true,
      default: undefined,
    },
    proofLinks: {
      type: [String],
      default: undefined,
    },

    idCardFront: { type: documentSchema, default: null },
    idCardBack: { type: documentSchema, default: null },
    selfie: { type: documentSchema, default: null },
    businessLicense: { type: documentSchema, default: null },
    bankProof: { type: documentSchema, default: null },

    ekycMetadata: {
      providerName: { type: String, trim: true, default: "" },
      providerSessionId: { type: String, trim: true, default: "" },
      verificationStatus: { 
        type: String, 
        enum: ["NOT_STARTED", "PENDING", "VERIFIED", "FAILED", "EXPIRED", "MANUAL_REVIEW"], 
        default: "NOT_STARTED" 
      },
      resultSummary: { type: String, trim: true, default: "" },
      score: { type: Number, default: 0 },
      verifiedAt: { type: Date, default: null }
    },

    commitment: {
      isAccepted: { type: Boolean, default: false },
      agreements: { type: [String], default: [] },
      version: { type: String, trim: true, default: "" },
      signedAt: { type: Date, default: null },
      signerName: { type: String, trim: true, default: "" },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      signatureHash: { type: String, default: "" },
      signedIpAddress: { type: String, default: "" },
      signedUserAgent: { type: String, default: "" }
    },

    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      default: null,
    },

    bankName: { type: String, required: true, trim: true, maxlength: 100 },
    bankAccountNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    bankAccountName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    aiRiskScore: { type: Number, min: 0, max: 100, default: 0 },

    status: {
      type: String,
      enum: Object.values(ORGANIZER_REQUEST_STATUS),
      default: ORGANIZER_REQUEST_STATUS.DRAFT_SUBMITTED,
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewReason: { type: String, default: "", trim: true, maxlength: 1000 },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },

    adminReview: {
      type: {
        checklist: {
          manualIdentityReviewAcknowledged: { type: Boolean, default: false },
          commitmentReviewed: { type: Boolean, default: false },
          organizationInfoReviewed: { type: Boolean, default: false },
          bankInfoReviewed: { type: Boolean, default: false },
          riskFlagsReviewed: { type: Boolean, default: false }
        },
        checklistVersion: { type: String, default: "1.0" },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        decision: { type: String, enum: ['APPROVED'] },
        decisionReason: { type: String, trim: true },
        checklistSnapshot: {
          requestStatusAtReview: String,
          ekycStatusAtReview: String,
          commitmentVersionAtReview: String,
          commitmentSignedAtReview: Date,
          riskFlagsAtReview: [String],
          checklistVersion: String
        }
      },
      default: undefined
    },

    resubmissionCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

organizerRequestSchema.index({ createdAt: -1 });
organizerRequestSchema.index({ status: 1, createdAt: -1 });

organizerRequestSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          ORGANIZER_REQUEST_STATUS.DRAFT_SUBMITTED,
          ORGANIZER_REQUEST_STATUS.SYSTEM_CHECKING,
          ORGANIZER_REQUEST_STATUS.AWAITING_MICRO_DEPOSIT,
          ORGANIZER_REQUEST_STATUS.PENDING,
        ],
      },
    },
  }
);

const OrganizerRequest = mongoose.model(
  "OrganizerRequest",
  organizerRequestSchema
);

export default OrganizerRequest;