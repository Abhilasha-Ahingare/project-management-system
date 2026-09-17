import Task from "./task.model.js";
import Project from "../projects/project.model.js";
import User from "../users/users.model.js";
import ApiError from "../../utils/ApiError.js";
import {
  logTaskCreated,
  logTaskUpdated,
  logTaskStatusChanged,
  logTaskAssigned,
  logTaskDeleted,
} from "../activities/activity.service.js";
import { notifySafely } from "../notifications/notification.service.js";
import { emitProjectEvent, emitTaskEvent } from "../../realtime/socket.js";
import {
  getAccessibleProject,
  hasAccessibleProject,
} from "../projects/project-access.service.js";
import Team from "../teams/team.model.js";

export const createTask = async (payload, userId) => {
  const project = await getAccessibleProject(payload.projectId, userId);

  // Verify assignee if provided
  if (payload.assigneeId) {
    const assignee = await User.findOne({
      _id: payload.assigneeId,
      isActive: true,
    });
    const assigneeHasDirectAccess =
      project.owner.toString() === payload.assigneeId ||
      project.members.some(
        (member) => member.user.toString() === payload.assigneeId,
      );
    const assigneeHasTeamAccess = project.team
      ? await Team.exists({
          _id: project.team,
          isActive: true,
          $or: [
            { lead: payload.assigneeId },
            { "members.user": payload.assigneeId },
          ],
        })
      : false;
    if (!assignee || (!assigneeHasDirectAccess && !assigneeHasTeamAccess)) {
      throw new ApiError(404, "Assignee not found");
    }
  }

  const task = await Task.create({
    title: payload.title?.trim(),
    description: payload.description || "",
    project: payload.projectId,
    assignee: payload.assigneeId || null,
    createdBy: userId,
    status: payload.status || "todo",
    priority: payload.priority || "medium",
    dueDate: payload.dueDate || null,
    dueReminderSentAt: null,
    tags: payload.tags || [],
  });

  await logTaskCreated(task._id, task.title, userId, task.project);
  emitProjectEvent(task.project.toString(), "task:created", task);
  if (task.assignee && task.assignee.toString() !== userId.toString()) {
    await notifySafely(
      {
        title: "Task assigned",
        message: `You were assigned the task "${task.title}"`,
        entityType: "Task",
        entityId: task._id,
      },
      task.assignee,
    );
  }

  return task.populate([
    { path: "project", select: "name slug" },
    { path: "assignee", select: "name email avatar" },
    { path: "createdBy", select: "name email avatar" },
  ]);
};

export const getProjectTasks = async (projectId, userId, filters = {}) => {
  await getAccessibleProject(projectId, userId);

  const query = {
    project: projectId,
    isActive: true,
  };

  // Apply optional filters
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.assigneeId) {
    query.assignee = filters.assigneeId;
  }
  if (filters.priority) {
    query.priority = filters.priority;
  }

  return Task.find(query)
    .populate("project", "name slug")
    .populate("assignee", "name email avatar")
    .populate("createdBy", "name email avatar")
    .sort({ createdAt: -1 });
};

export const getTaskById = async (taskId, userId) => {
  const task = await Task.findOne({
    _id: taskId,
    isActive: true,
  })
    .populate("project", "name slug")
    .populate("assignee", "name email avatar")
    .populate("createdBy", "name email avatar");

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  // Verify user has access to the project
  await getAccessibleProject(task.project._id, userId);

  return task;
};

export const updateTask = async (taskId, payload, userId) => {
  const task = await Task.findOne({
    _id: taskId,
    isActive: true,
  });

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  const project = await getAccessibleProject(task.project, userId);

  const changes = {};
  const oldStatus = task.status;
  const oldAssignee = task.assignee?.toString() || null;

  // Verify assignee if updating
  if (payload.assigneeId && payload.assigneeId !== task.assignee?.toString()) {
    const assignee = await User.findOne({
      _id: payload.assigneeId,
      isActive: true,
    });
    const assigneeHasDirectAccess =
      project.owner.toString() === payload.assigneeId ||
      project.members.some(
        (member) => member.user.toString() === payload.assigneeId,
      );
    const assigneeHasTeamAccess = project.team
      ? await Team.exists({
          _id: project.team,
          isActive: true,
          $or: [
            { lead: payload.assigneeId },
            { "members.user": payload.assigneeId },
          ],
        })
      : false;
    if (!assignee || (!assigneeHasDirectAccess && !assigneeHasTeamAccess)) {
      throw new ApiError(404, "Assignee not found");
    }
    task.assignee = payload.assigneeId;
  }

  // Update task fields
  if (payload.title) task.title = payload.title.trim();
  if (payload.description !== undefined) task.description = payload.description;
  if (payload.status) {
    task.status = payload.status;
    if (payload.status !== oldStatus) {
      changes.status = { oldValue: oldStatus, newValue: payload.status };
    }
  }
  if (payload.priority) task.priority = payload.priority;
  if (payload.dueDate !== undefined) {
    task.dueDate = payload.dueDate;
    task.dueReminderSentAt = null;
  }
  if (payload.tags) task.tags = payload.tags;

  // Mark as completed if status is "done"
  if (payload.status === "done" && !task.completedAt) {
    task.completedAt = new Date();
  }

  await task.save();
  emitTaskEvent(task._id.toString(), "task:updated", task);

  if (payload.status && payload.status !== oldStatus) {
    await logTaskStatusChanged(
      task._id,
      task.title,
      userId,
      task.project,
      oldStatus,
      task.status,
    );
    if (task.createdBy.toString() !== userId.toString()) {
      await notifySafely(
        {
          title: "Task status updated",
          message: `Task "${task.title}" changed from ${oldStatus} to ${task.status}`,
          entityType: "Task",
          entityId: task._id,
        },
        task.createdBy,
      );
    }
  }
  if (payload.assigneeId && payload.assigneeId !== oldAssignee) {
    await logTaskAssigned(
      task._id,
      task.title,
      userId,
      task.project,
      task.assignee,
    );
    if (payload.assigneeId !== userId.toString()) {
      await notifySafely(
        {
          title: "Task assigned",
          message: `You were assigned the task "${task.title}"`,
          entityType: "Task",
          entityId: task._id,
        },
        payload.assigneeId,
      );
    }
  }
  if (
    Object.keys(changes).length ||
    payload.title ||
    payload.description !== undefined ||
    payload.priority ||
    payload.dueDate !== undefined ||
    payload.tags
  ) {
    await logTaskUpdated(task._id, task.title, userId, task.project, changes);
  }

  return task.populate([
    { path: "project", select: "name slug" },
    { path: "assignee", select: "name email avatar" },
    { path: "createdBy", select: "name email avatar" },
  ]);
};

export const deleteTask = async (taskId, userId) => {
  const task = await Task.findOne({
    _id: taskId,
    isActive: true,
  });

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  const project = await getAccessibleProject(task.project, userId);

  task.isActive = false;
  await task.save();
  emitTaskEvent(task._id.toString(), "task:deleted", { taskId: task._id });

  await logTaskDeleted(task._id, task.title, userId, task.project);

  return { deleted: true };
};

export const getTasksByUser = async (userId) => {
  const tasks = await Task.find({
    assignee: userId,
    isActive: true,
  })
    .populate("project", "name slug")
    .populate("createdBy", "name email avatar")
    .sort({ dueDate: 1, priority: -1 });
  const accessible = await Promise.all(
    tasks.map(async (task) =>
      (await hasAccessibleProject(task.project?._id || task.project, userId))
        ? task
        : null,
    ),
  );
  return accessible.filter(Boolean);
};
