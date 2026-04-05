import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import {
  PROJECT_STATUS,
  PROJECT_CATEGORY,
  MILESTONE_STATUS,
} from "./project.constant.js";

const milestoneSchema = new mongoose.Schema(
  {
    milestoneId: { type: String, default: uuidv4 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    targetAmount: { type: Number, required: true, min: 0 },
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
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: Object.values(PROJECT_CATEGORY),
      required: true,
      index: true,
    },

    coverMedia: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
      mediaType: { type: String, enum: ["image", "video"], default: "image" },
    },

    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],

    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
      address: { type: String, required: true },
    },

    targetAmount: { type: Number, default: 0, min: 0 },
    currentAmount: { type: Number, default: 0, min: 0 },
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
    pauseReason: { type: String, default: null },

    aiRiskScore: { type: Number, min: 0, max: 100, default: null },
    riskFlags: [{ type: String }],

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
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
      followerCount: { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

projectSchema.index({ location: "2dsphere" });
projectSchema.index({ status: 1, category: 1, createdAt: -1 });
projectSchema.index({ status: 1, needsVolunteers: 1, isVolunteerFull: 1 });

projectSchema.index(
  { title: "text", "location.address": "text", description: "text" },
  {
    weights: { title: 10, "location.address": 5, description: 1 },
    name: "ProjectTextIndex",
  },
);

projectSchema.pre("save", function (next) {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    return next(new Error("Ngày kết thúc phải sau ngày bắt đầu dự án."));
  }
  next();
});

projectSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"],
  function (next) {
    const update = this.getUpdate();

    const startDate = update.$set?.startDate || update.startDate;
    const endDate = update.$set?.endDate || update.endDate;

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return next(new Error("Ngày kết thúc phải sau ngày bắt đầu dự án."));
    }
    next();
  },
);

const Project = mongoose.model("Project", projectSchema);
export default Project;