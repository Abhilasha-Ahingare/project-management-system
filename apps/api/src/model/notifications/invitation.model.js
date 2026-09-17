import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["Project", "Team", "Collaboration", "CollaborationProject"],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    targetName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["owner", "lead", "admin", "member", "viewer", "editor", "manager"],
      default: "member",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

invitationSchema.index({ recipient: 1, status: 1, expiresAt: 1 });
invitationSchema.index({ targetType: 1, targetId: 1, recipient: 1, status: 1 });

const Invitation = mongoose.model("Invitation", invitationSchema);

export default Invitation;
