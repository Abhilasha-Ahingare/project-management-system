import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["in-app", "email", "push"],
      default: "in-app",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    entityType: {
      type: String,
      enum: [
        "Project",
        "Task",
        "Comment",
        "Team",
        "Collaboration",
        "CollaborationProject",
      ],
      default: null,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, isActive: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1, isActive: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
