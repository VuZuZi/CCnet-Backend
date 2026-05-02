import mongoose from "mongoose";
import {
  AGREEMENT_RECORD_STATUS,
  AGREEMENT_SUBJECT_TYPE,
} from "./agreementRecord.constant.js";

const agreementRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectType: {
      type: String,
      enum: Object.values(AGREEMENT_SUBJECT_TYPE),
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(AGREEMENT_RECORD_STATUS),
      default: AGREEMENT_RECORD_STATUS.ACTIVE,
    },
    version: { type: String, required: true, trim: true },
    language: { type: String, default: "vi", trim: true },
    signerName: { type: String, required: true, trim: true },
    signedAt: { type: Date, required: true },
    agreementCodes: { type: [String], required: true },
    contentSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    integrityHash: { type: String, required: true, trim: true },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

agreementRecordSchema.index({ userId: 1, subjectType: 1, subjectId: 1 });
agreementRecordSchema.index({ subjectId: 1, subjectType: 1 });
agreementRecordSchema.index({ status: 1 });

const AgreementRecord = mongoose.model(
  "AgreementRecord",
  agreementRecordSchema
);

export default AgreementRecord;
