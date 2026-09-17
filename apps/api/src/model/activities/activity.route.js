import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import {
  getEntityActivitiesController,
  getContextActivitiesController,
  getUserActivityFeedController,
  getActorActivitiesController,
} from "./activity.controller.js";

const router = express.Router();

router.use(authMiddleware);

// Get current user's activity feed (must come before /:entityType/:entityId)
router.get("/activities/me/feed", getUserActivityFeedController);

// Get a specific user's activities
router.get("/activities/user/:actorId", getActorActivitiesController);

// Get activities for a specific entity (Project, Task, etc.)
// Example: GET /activities/Project/123 or GET /activities/Task/456
router.get("/activities/:entityType/:entityId", getEntityActivitiesController);

// Get activities for a context (e.g., all activities in a project)
// Example: GET /context-activities/Project/123
router.get(
  "/context-activities/:contextType/:contextId",
  getContextActivitiesController,
);

export default router;
