import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    permission: {
      type: String,
      enum: ["viewer", "editor", "manager"],
      default: "editor",
    },
    status: {
      type: String,
      enum: ["invited", "accepted", "rejected", "removed"],
      default: "invited",
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
  },
  { _id: false },
);

const boardSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    participants: { type: [participantSchema], default: [] },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    snapshotVersion: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
boardSchema.index({ project: 1, isActive: 1, createdAt: -1 });

const activitySchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CollaborationBoard",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: { type: String, required: true, maxlength: 60 },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
activitySchema.index({ board: 1, createdAt: -1 });

const sessionSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CollaborationBoard",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    messageCount: { type: Number, default: 0 },
    activityCount: { type: Number, default: 0 },
    summary: { type: String, default: "" },
    summaryType: {
      type: String,
      enum: ["deterministic", "manual"],
      default: "deterministic",
    },
  },
  { timestamps: true },
);

export const CollaborationBoard = mongoose.model(
  "CollaborationBoard",
  boardSchema,
);
export const CollaborationActivity = mongoose.model(
  "CollaborationActivity",
  activitySchema,
);
export const CollaborationSession = mongoose.model(
  "CollaborationSession",
  sessionSchema,
);
