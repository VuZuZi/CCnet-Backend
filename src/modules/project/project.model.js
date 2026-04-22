import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import {
  PROJECT_STATUS,
  PROJECT_CATEGORY,
  MILESTONE_STATUS,
  PROJECT_TYPE,
  SURPLUS_POLICY,
} from "./project.constant.js";

const evidencePolicySchema = new mongoose.Schema(
  {
    requireFinancial: { type: Boolean, default: false },
    requireGeoPhotos: { type: Number, default: 0 },
    requireVolunteerLogs: { type: Boolean, default: false }
  },
  { _id: false }
);

const refundSummarySchema = new mongoose.Schema({
    isRefunded: { type: Boolean, default: false },
    totalRefunded: { type: Number, default: 0 },
    donorCount: { type: Number, default: 0 },
    refundedAt: { type: Date, default: null },
    message: { type: String, default: 'Hệ thống đang tiến hành đối soát và hoàn trả tiền tự động.' }
}, { _id: false });

const milestoneSchema = new mongoose.Schema(
  {
    milestoneId: { type: String, default: uuidv4 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    deliverables: { type: String, trim: true, maxlength: 1000 },
    targetAmount: { type: Number, default: 0, min: 0 },
    
    actualDisbursedAmount: { type: Number, default: 0, min: 0 },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined },
      address: { type: String }
    },
    evidencePolicy: {
      type: evidencePolicySchema,
      default: () => ({ requireFinancial: false, requireGeoPhotos: 0 })
    },

    refundSummary: {
        type: refundSummarySchema,
        default: () => ({})
    },

    status: {
      type: String,
      enum: Object.values(MILESTONE_STATUS),
      default: MILESTONE_STATUS.PENDING,
    },
    disbursementRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DisbursementRequest",
      default: null,
    },
  },
  { _id: false },
);

const volunteerRoleSchema = new mongoose.Schema(
  {
    roleId: { type: String, default: uuidv4 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    quantity: { type: Number, required: true, min: 1 },
    skillsRequired: [{ type: String, trim: true }],
    location: { type: String, trim: true },
    duration: { type: String, trim: true },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    projectType: {
      type: String,
      enum: Object.values(PROJECT_TYPE),
      required: true,
      index: true,
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: Object.values(PROJECT_CATEGORY),
      required: true,
      index: true,
    },
    beneficiaryInfo: {
      details: { type: String },
      totalBeneficiaries: { type: Number, default: 0 },
      evidenceMethod: { type: String },
    },
    coverMedia: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
      mediaType: {
        type: String,
        enum: ["image", "video"],
        default: "image",
      },
    },
    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
      address: { type: String, required: true },
    },
    targetAmount: { type: Number, default: 0, min: 0 },
    currentAmount: { type: Number, default: 0, min: 0 },
    mvpAmount: { type: Number, default: 0, min: 0 },
    budgetBreakdown: [
      {
        item: { type: String, required: true },
        amount: { type: Number, required: true },
        note: { type: String },
      },
    ],
    surplusPolicy: {
      type: String,
      enum: Object.values(SURPLUS_POLICY),
      default: SURPLUS_POLICY.DONATE_TO_PLATFORM,
    },
    carryOverProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    milestones: [milestoneSchema],
    needsVolunteers: { type: Boolean, default: false },
    volunteerRoles: [volunteerRoleSchema],
    isVolunteerFull: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(PROJECT_STATUS),
      default: PROJECT_STATUS.DRAFT,
      index: true,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    isUrgent: { type: Boolean, default: false, index: true },

    isOverFunded: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },

    pauseReason: { type: String, default: null },
    aiRiskScore: { type: Number, min: 0, max: 100, default: null },
    riskFlags: [{ type: String }],

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    revisionRequestedAt: { type: Date, default: null },
    revisionCount: { type: Number, default: 0 },
    rejectionReason: { type: String, default: null },
    updateRequestReason: { type: String, default: null },
    updateRequestedAt: { type: Date, default: null },
    updateSubmittedAt: { type: Date, default: null },
    updateSubmittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fromHelpRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      default: null,
    },

    stats: {
      donorCount: { type: Number, default: 0 },
      viewCount: { type: Number, default: 0 },
      shareCount: { type: Number, default: 0 },
      targetVolunteers: { type: Number, default: 0 },
      currentVolunteers: { type: Number, default: 0 },
      followerCount: { type: Number, default: 0 },
    },
    postProjectSummary: {
      totalSurplus: { type: Number, default: 0 },
      walletRefundsAmount: { type: Number, default: 0 },
      charitySweepAmount: { type: Number, default: 0 },
      walletCount: { type: Number, default: 0 },
      completedAt: { type: Date }
    }
  },
  {
    timestamps: true,
  },
);

projectSchema.index({ location: "2dsphere" });
projectSchema.index({ projectType: 1, status: 1 });
projectSchema.index({ status: 1, category: 1, createdAt: -1 });
projectSchema.index({ status: 1, needsVolunteers: 1, isVolunteerFull: 1 });
projectSchema.index({ status: 1, "stats.viewCount": -1 });
projectSchema.index({ status: 1, endDate: 1 });
projectSchema.index({ organizerId: 1, status: 1, createdAt: -1 });

projectSchema.pre("save", function (next) {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    return next(new Error("Ngày không hợp lệ"));
  }
  next();
});

projectSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"],
  async function (next) {
    const update = this.getUpdate();
    const newStartDate = update.$set?.startDate || update.startDate;
    const newEndDate = update.$set?.endDate || update.endDate;

    if (newStartDate === undefined && newEndDate === undefined) {
      return next();
    }

    try {
      let currentDoc = {};
      if (newStartDate === undefined || newEndDate === undefined) {
        currentDoc = await this.model.findOne(this.getQuery()).select('startDate endDate').lean();
        if (!currentDoc) return next();
      }

      const finalStartDate = newStartDate !== undefined ? newStartDate : currentDoc.startDate;
      const finalEndDate = newEndDate !== undefined ? newEndDate : currentDoc.endDate;

      if (finalStartDate && finalEndDate && new Date(finalStartDate) >= new Date(finalEndDate)) {
        return next(new Error("Ngày kết thúc phải diễn ra sau ngày bắt đầu dự án."));
      }
      next();
    } catch (error) {
      next(error);
    }
  },
);

const Project = mongoose.model("Project", projectSchema);

export default Project;
