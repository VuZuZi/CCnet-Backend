import mongoose from "mongoose";

const volunteerReviewSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    milestoneId: {
      type: String,
      required: true,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "volunteer",
      required: true,
      index: true,
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VolunteerAttendance",
      required: true,
      index: true,
    },
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    score: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "AUTO_MAXED"],
      default: "PENDING",
      index: true,
    },
    reviewSource: {
      type: String,
      enum: ["MANUAL", "AUTO"],
      default: null,
    },
    deadlineAt: {
      type: Date,
      required: true,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    autoScoredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

volunteerReviewSchema.index(
  { projectId: 1, milestoneId: 1, volunteerId: 1 },
  { unique: true, name: "uniq_review_per_milestone_volunteer" }
);

volunteerReviewSchema.index({ status: 1, deadlineAt: 1 });

const VolunteerReview =
  mongoose.models.VolunteerReview ||
  mongoose.model("VolunteerReview", volunteerReviewSchema);

export default VolunteerReview;