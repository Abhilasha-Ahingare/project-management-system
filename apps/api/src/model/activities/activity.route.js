import express from "express";
import Joi from "joi";

import authMiddleware from "../../middleware/auth.middleware.js";
import {
  validateObjectIdParam,
  default as validate,
} from "../../middleware/validation.middleware.js";
import {
  getEntityActivitiesController,
  getContextActivitiesController,
  getUserActivityFeedController,
  getActorActivitiesController,
} from "./activity.controller.js";

const router = express.Router();
router.param("actorId", validateObjectIdParam("actorId"));
router.param("entityId", validateObjectIdParam("entityId"));
router.param("contextId", validateObjectIdParam("contextId"));
const objectId = Joi.string().hex().length(24).required();
const activityLimitSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100),
});

router.use(authMiddleware);

// Get current user's activity feed (must come before /:entityType/:entityId)
router.get(
  "/activities/me/feed",
  validate(activityLimitSchema, "query"),
  getUserActivityFeedController,
);

// Get a specific user's activities
router.get(
  "/activities/user/:actorId",
  validate(Joi.object({ actorId: objectId }), "params"),
  validate(activityLimitSchema, "query"),
  getActorActivitiesController,
);

// Get activities for a specific entity (Project, Task, etc.)
// Example: GET /activities/Project/123 or GET /activities/Task/456
router.get(
  "/activities/:entityType/:entityId",
  validate(
    Joi.object({
      entityType: Joi.string().valid("Project", "Task", "Team").required(),
      entityId: objectId,
    }),
    "params",
  ),
  validate(activityLimitSchema, "query"),
  getEntityActivitiesController,
);

// Get activities for a context (e.g., all activities in a project)
// Example: GET /context-activities/Project/123
router.get(
  "/context-activities/:contextType/:contextId",
  validate(
    Joi.object({
      contextType: Joi.string().valid("Project", "Team").required(),
      contextId: objectId,
    }),
    "params",
  ),
  validate(activityLimitSchema, "query"),
  getContextActivitiesController,
);

export default router;
