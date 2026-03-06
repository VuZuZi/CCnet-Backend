import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    recipient: {
      type: String,
      default: "all",
    },
    sender: {
      type: String,
      default: "system",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);
const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
