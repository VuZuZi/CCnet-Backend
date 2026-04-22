import mongoose from "mongoose";

const volunteerReviewSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "volunteer",
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
      default: 5,
    },
    comment: {
      type: String,
      trim: true,
      default: "Bạn đã hoàn thành tốt vai trò tình nguyện viên trong dự án.",
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED"],
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

volunteerReviewSchema.index(
  { projectId: 1, volunteerId: 1 },
  { unique: true, name: "uniq_review_per_project_volunteer" }
);

const VolunteerReview =
  mongoose.models.VolunteerReview ||
  mongoose.model("VolunteerReview", volunteerReviewSchema);

export default VolunteerReview;