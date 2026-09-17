import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Type of action performed
    action: {
      type: String,
      enum: [
        "created",
        "updated",
        "deleted",
        "commented",
        "assigned",
        "status_changed",
        "priority_changed",
      ],
      required: true,
      index: true,
    },
    // Type of entity affected
    entityType: {
      type: String,
      enum: ["Project", "Task", "Team", "Comment"],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // Optional context entity (e.g., project for a task activity)
    contextType: {
      type: String,
      enum: ["Project", "Team", null],
      default: null,
    },
    contextId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    // Description of the activity
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    // Store changes for auditing (old value -> new value)
    changes: {
      type: Map,
      of: new mongoose.Schema(
        {
          oldValue: mongoose.Schema.Types.Mixed,
          newValue: mongoose.Schema.Types.Mixed,
        },
        { _id: false },
      ),
    },
    // For visibility control
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying by entity
activitySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
// Index for user activity feed
activitySchema.index({ actor: 1, createdAt: -1 });
// Index for context-based queries
activitySchema.index({ contextType: 1, contextId: 1, createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;
