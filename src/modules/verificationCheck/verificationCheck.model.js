import mongoose from "mongoose";
import {
  VERIFICATION_CHECK_SUBJECT_TYPE,
  VERIFICATION_CHECK_STATUS,
} from "./verificationCheck.constant.js";
import {
  VERIFICATION_PROVIDER_MODE,
} from "../../core/verification/verification.constant.js";

const verificationCheckSchema = new mongoose.Schema(
  {
    organizerRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizerRequest",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectType: {
      type: String,
      enum: Object.values(VERIFICATION_CHECK_SUBJECT_TYPE),
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    providerName: {
      type: String,
      required: true,
      trim: true,
    },
    providerMode: {
      type: String,
      enum: Object.values(VERIFICATION_PROVIDER_MODE),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(VERIFICATION_CHECK_STATUS),
      required: true,
    },
    isMock: {
      type: Boolean,
      default: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    riskFlags: {
      type: [String],
      default: [],
    },
    resultSummary: {
      type: String,
      default: "",
      trim: true,
    },
    checkedAt: {
      type: Date,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    disclaimer: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

verificationCheckSchema.index({ organizerRequestId: 1, createdAt: -1 });
verificationCheckSchema.index({ userId: 1, createdAt: -1 });
verificationCheckSchema.index({ providerName: 1, status: 1 });

const VerificationCheck = mongoose.model(
  "VerificationCheck",
  verificationCheckSchema
);

export default VerificationCheck;
