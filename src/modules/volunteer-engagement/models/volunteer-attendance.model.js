import mongoose from "mongoose";

const volunteerAttendanceSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["PENDING", "ATTENDED", "ABSENT"],
      default: "PENDING",
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

volunteerAttendanceSchema.index(
  { projectId: 1, milestoneId: 1, volunteerId: 1 },
  { unique: true, name: "uniq_attendance_per_milestone_volunteer" }
);

const VolunteerAttendance =
  mongoose.models.VolunteerAttendance ||
  mongoose.model("VolunteerAttendance", volunteerAttendanceSchema);

export default VolunteerAttendance;