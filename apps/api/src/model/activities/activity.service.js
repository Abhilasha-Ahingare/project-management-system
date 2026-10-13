import Activity from "./activity.model.js";
import Task from "../tasks/task.model.js";
import Team from "../teams/team.model.js";
import User from "../users/users.model.js";
import { getAccessibleProject } from "../projects/project-access.service.js";
import ApiError from "../../utils/ApiError.js";
import { clampLimit } from "../../utils/security.helpers.js";

const assertActivityAccess = async (entityType, entityId, userId) => {
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  if (actor.role === "admin") return;

  if (entityType === "Project") {
    await getAccessibleProject(entityId, userId);
    return;
  }
  if (entityType === "Task") {
    const task = await Task.findOne({ _id: entityId, isActive: true }).select(
      "project",
    );
    if (!task) throw new ApiError(404, "Task not found");
    await getAccessibleProject(task.project, userId);
    return;
  }
  if (entityType === "Team") {
    const team = await Team.findOne({ _id: entityId, isActive: true }).select(
      "lead members",
    );
    if (!team) throw new ApiError(404, "Team not found");
    if (
      team.lead.toString() !== userId &&
      !team.members.some((member) => member.user.toString() === userId)
    )
      throw new ApiError(403, "Team activity access required");
    return;
  }
  throw new ApiError(400, "Unsupported activity entity");
};

const assertContextAccess = async (contextType, contextId, userId) => {
  if (contextType === "Project") {
    await assertActivityAccess("Project", contextId, userId);
    return;
  }
  await assertActivityAccess("Team", contextId, userId);
};

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
  await assertActivityAccess(entityType, entityId, userId);
  return Activity.find({
    entityType,
    entityId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(clampLimit(limit, 20));
};

// Get activities for a context (e.g., all activities in a project)
export const getContextActivities = async (
  contextType,
  contextId,
  userId,
  limit = 50,
) => {
  await assertContextAccess(contextType, contextId, userId);
  return Activity.find({
    contextType,
    contextId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(clampLimit(limit, 50));
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
export const getActorActivities = async (actorId, userId, limit = 30) => {
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  if (actorId !== userId && actor.role !== "admin")
    throw new ApiError(403, "You can only view your own activity");
  return Activity.find({
    actor: actorId,
  })
    .populate("actor", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(clampLimit(limit, 30));
};

// Log common activities
export const logProjectCreated = async (projectId, projectName, userId) => {
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
