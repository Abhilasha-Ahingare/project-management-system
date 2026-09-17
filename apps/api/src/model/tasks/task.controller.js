import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";

import {
  createTask,
  getProjectTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTasksByUser,
} from "./task.service.js";

export const createTaskController = asyncHandler(async (req, res) => {
  const task = await createTask(
    {
      ...req.body,
      projectId: req.params.projectId,
    },
    req.user.id,
  );

  res.status(201).json(new ApiResponse(201, task, "Task created successfully"));
});

export const getProjectTasksController = asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    assigneeId: req.query.assigneeId,
    priority: req.query.priority,
  };

  const tasks = await getProjectTasks(
    req.params.projectId,
    req.user.id,
    filters,
  );

  res
    .status(200)
    .json(new ApiResponse(200, tasks, "Tasks fetched successfully"));
});

export const getTaskController = asyncHandler(async (req, res) => {
  const task = await getTaskById(req.params.taskId, req.user.id);

  res.status(200).json(new ApiResponse(200, task, "Task fetched successfully"));
});

export const updateTaskController = asyncHandler(async (req, res) => {
  const task = await updateTask(req.params.taskId, req.body, req.user.id);

  res.status(200).json(new ApiResponse(200, task, "Task updated successfully"));
});

export const deleteTaskController = asyncHandler(async (req, res) => {
  const result = await deleteTask(req.params.taskId, req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, result, "Task deleted successfully"));
});

export const getUserTasksController = asyncHandler(async (req, res) => {
  const tasks = await getTasksByUser(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, tasks, "User tasks fetched successfully"));
});
