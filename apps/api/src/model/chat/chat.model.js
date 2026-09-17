import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      enum: ["Project", "Task", "Team", "Direct", "CollaborationBoard"],
      required: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, default: "", trim: true, maxlength: 4000 },
    mentionedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    attachment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      default: null,
    },
    isPinned: { type: Boolean, default: false },
    pinnedAt: { type: Date, default: null },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

messageSchema.index({ scopeType: 1, scopeId: 1, createdAt: -1 });
export default mongoose.model("Message", messageSchema);
