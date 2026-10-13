import express from "express";
import Joi from "joi";

import authMiddleware from "../../middleware/auth.middleware.js";
import {
  validateObjectIdParam,
  default as validate,
} from "../../middleware/validation.middleware.js";
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
router.param("projectId", validateObjectIdParam("projectId"));
router.param("taskId", validateObjectIdParam("taskId"));
const taskQuerySchema = Joi.object({
  status: Joi.string().valid("todo", "in-progress", "review", "done"),
  priority: Joi.string().valid("low", "medium", "high", "urgent"),
  assigneeId: Joi.string().hex().length(24),
});

router.use(authMiddleware);

// Get all tasks assigned to current user
router.get("/tasks/me", getUserTasksController);
router.get("/tasks/me/summary", getMyTaskSummaryController);
router.get("/task-report", getTaskReportController);

// Project tasks routes
router
  .route("/projects/:projectId/tasks")
  .get(validate(taskQuerySchema, "query"), getProjectTasksController)
  .post(validate(createTaskSchema), createTaskController);

// Single task routes
router
  .route("/tasks/:taskId")
  .get(getTaskController)
  .patch(validate(updateTaskSchema), updateTaskController)
  .delete(deleteTaskController);

export default router;
