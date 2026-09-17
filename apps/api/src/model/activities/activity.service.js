import Activity from "./activity.model.js";
import ApiError from "../../utils/ApiError.js";

// Helper to log an activity
export const logActivity = async (activityData) => {
  try {
    const activity = await Activity.create(activityData);
    return activity.populate("actor", "name email avatar");
  } catch (error) {
    // Log error but don't fail the main operation
    console.error("Error logging activity:", error);
    return null;
  }
};

// Get activities for a specific entity
export const getEntityActivities = async (
  entityType,
  entityId,
  userId,
  limit = 20,
) => {
  return Activity.find({
    entityType,
    entityId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get activities for a context (e.g., all activities in a project)
export const getContextActivities = async (
  contextType,
  contextId,
  userId,
  limit = 50,
) => {
  return Activity.find({
    contextType,
    contextId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get user activity feed
export const getUserActivityFeed = async (userId, limit = 30) => {
  return Activity.find({
    actor: userId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get activities by actor
export const getActorActivities = async (actorId, limit = 30) => {
  return Activity.find({
    actor: actorId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Log common activities
export const logProjectCreated = async (
  projectId,
  projectName,
  userId,
) => {
  return logActivity({
    actor: userId,
    action: "created",
    entityType: "Project",
    entityId: projectId,
    contextType: "Project",
    contextId: projectId,
    description: `Created project "${projectName}"`,
  });
};

export const logProjectUpdated = async (
  projectId,
  projectName,
  userId,
  changes = {},
) => {
  return logActivity({
    actor: userId,
    action: "updated",
    entityType: "Project",
    entityId: projectId,
    description: `Updated project "${projectName}"`,
    changes,
  });
};

export const logTaskCreated = async (taskId, taskTitle, userId, projectId) => {
  return logActivity({
    actor: userId,
    action: "created",
    entityType: "Task",
    entityId: taskId,
    contextType: "Project",
    contextId: projectId,
    description: `Created task "${taskTitle}"`,
  });
};

export const logTaskUpdated = async (
  taskId,
  taskTitle,
  userId,
  projectId,
  changes = {},
) => {
  return logActivity({
    actor: userId,
    action: "updated",
    entityType: "Task",
    entityId: taskId,
    contextType: "Project",
    contextId: projectId,
    description: `Updated task "${taskTitle}"`,
    changes,
  });
};

export const logTaskStatusChanged = async (
  taskId,
  taskTitle,
  userId,
  projectId,
  oldStatus,
  newStatus,
) => {
  return logActivity({
    actor: userId,
    action: "status_changed",
    entityType: "Task",
    entityId: taskId,
    contextType: "Project",
    contextId: projectId,
    description: `Changed task status from ${oldStatus} to ${newStatus}`,
    changes: {
      status: {
        oldValue: oldStatus,
        newValue: newStatus,
      },
    },
  });
};

export const logTaskAssigned = async (
  taskId,
  taskTitle,
  userId,
  projectId,
  assignee,
) => {
  return logActivity({
    actor: userId,
    action: "assigned",
    entityType: "Task",
    entityId: taskId,
    contextType: "Project",
    contextId: projectId,
    description: `Assigned task "${taskTitle}" to ${assignee?.name || "unassigned"}`,
  });
};

export const logTaskDeleted = async (taskId, taskTitle, userId, projectId) => {
  return logActivity({
    actor: userId,
    action: "deleted",
    entityType: "Task",
    entityId: taskId,
    contextType: "Project",
    contextId: projectId,
    description: `Deleted task "${taskTitle}"`,
  });
};
