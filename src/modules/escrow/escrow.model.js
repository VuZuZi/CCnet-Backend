import mongoose from "mongoose";

const escrowSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    totalDeposited: { type: Number, default: 0, min: 0 },
    pendingRefunds: { type: Number, default: 0, min: 0 },
    completedRefunds: { type: Number, default: 0, min: 0 },
    totalDisbursed: { type: Number, default: 0, min: 0 },
    platformFeeCollected: { type: Number, default: 0, min: 0 },
    retainedDonations: { type: Number, default: 0, min: 0 },
    disputedAmount: { type: Number, default: 0, min: 0 },
    pendingDisbursementAmount: { type: Number, default: 0, min: 0 },
    availableBalance: { type: Number, default: 0, min: 0 },
    lastReconciled: { type: Date, default: Date.now },
    reconciliationStatus: {
      type: String,
      enum: ["OK", "DISCREPANCY_DETECTED", "INVESTIGATING"],
      default: "OK",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("EscrowAccount", escrowSchema);