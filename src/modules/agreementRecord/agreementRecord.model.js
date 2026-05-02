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
    signatureSnapshot: {
      type: new mongoose.Schema(
        {
          method: { type: String, enum: ["DRAWN"], required: true },
          signerName: { type: String, required: true, trim: true },
          signedAt: { type: Date, required: true },
          signatureImageDataUrl: {
            type: String,
            required: true,
            maxlength: 200000,
          },
          signatureImageHash: { type: String, required: true, trim: true },
          metadata: {
            userAgent: { type: String, default: "", trim: true },
            ipAddress: { type: String, default: "", trim: true },
          },
        },
        { _id: false }
      ),
      default: undefined,
    },
    integrityHash: { type: String, required: true, trim: true },
    isSealed: { type: Boolean, default: false },
    sealedAt: { type: Date, default: null },
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

const SEALED_FIELDS = [
  "contentSnapshot",
  "signatureSnapshot",
  "integrityHash",
  "signedAt",
  "signerName",
  "agreementCodes",
  "version",
  "language",
  "subjectType",
  "subjectId",
  "userId",
  "isSealed",
  "sealedAt",
];

function collectUpdatedFieldKeys(update = {}) {
  const fieldKeys = new Set();

  for (const op of ["$set", "$unset", "$rename", "$setOnInsert"]) {
    if (update[op]) {
      Object.keys(update[op]).forEach((key) => fieldKeys.add(key));
    }
  }

  Object.keys(update)
    .filter((key) => !key.startsWith("$"))
    .forEach((key) => fieldKeys.add(key));

  return fieldKeys;
}

function assertNoSealedFieldMutation(update = {}) {
  if (Array.isArray(update)) {
    throw new Error("AgreementRecord update pipelines are not allowed");
  }

  const fieldKeys = collectUpdatedFieldKeys(update);

  for (const key of fieldKeys) {
    const baseField = key.split(".")[0];
    if (SEALED_FIELDS.includes(baseField)) {
      throw new Error(`Cannot modify sealed AgreementRecord field: ${key}`);
    }
  }
}

function blockSealedFieldUpdates(next) {
  try {
    if (this.getOptions?.().upsert) {
      throw new Error("AgreementRecord update upserts are not allowed");
    }
    assertNoSealedFieldMutation(this.getUpdate?.() || {});
    next();
  } catch (error) {
    next(error);
  }
}

agreementRecordSchema.pre("findOneAndUpdate", blockSealedFieldUpdates);
agreementRecordSchema.pre("updateOne", blockSealedFieldUpdates);
agreementRecordSchema.pre("updateMany", blockSealedFieldUpdates);

const AgreementRecord = mongoose.model(
  "AgreementRecord",
  agreementRecordSchema
);

export default AgreementRecord;
