import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import {
  createTaskController,
  getProjectTasksController,
  getTaskController,
  updateTaskController,
  deleteTaskController,
  getUserTasksController,
} from "./task.controller.js";
import { createTaskSchema, updateTaskSchema } from "./task.validation.js";
import {
  getMyTaskSummaryController,
  getTaskReportController,
} from "./task.report.controller.js";

const router = express.Router();

router.use(authMiddleware);

// Get all tasks assigned to current user
router.get("/tasks/me", getUserTasksController);
router.get("/tasks/me/summary", getMyTaskSummaryController);
router.get("/task-report", getTaskReportController);

// Project tasks routes
router
  .route("/projects/:projectId/tasks")
  .get(getProjectTasksController)
  .post(validate(createTaskSchema), createTaskController);

// Single task routes
router
  .route("/tasks/:taskId")
  .get(getTaskController)
  .patch(validate(updateTaskSchema), updateTaskController)
  .delete(deleteTaskController);

export default router;
