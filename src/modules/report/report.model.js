import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    report_ref: { type: String, unique: true, required: true },
    reporter_ref: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    target_type: {
      type: String,
      enum: ["post", "comment", "user", "Post", "Comment", "User"],
      default: "post",
    },

    target_ref: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: (doc) => {
        if (doc && doc.target_type) {
          return (
            doc.target_type.charAt(0).toUpperCase() + doc.target_type.slice(1)
          );
        }
        return "Post";
      },
    },

    reason_code: {
      type: String,
      enum: [
        "spam",
        "harassment",
        "inappropriate",
        "violence",
        "hate_speech",
        "other",
      ],
      required: true,
    },
    description: { type: String, maxlength: 1000 },
    evidence_files: [{ type: String }],

    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "rejected"],
      default: "pending",
    },

    reviewed_by_ref: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewed_at: { type: Date },

    action: {
      type: String,
      default: "none",
    },

    decision_note: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);

export default mongoose.model("Report", reportSchema);
