import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";

import {
  getEntityActivities,
  getContextActivities,
  getUserActivityFeed,
  getActorActivities,
} from "./activity.service.js";

export const getEntityActivitiesController = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!["Project", "Task", "Team", "Comment"].includes(entityType)) {
    throw new ApiError(400, "Invalid entity type");
  }

  const activities = await getEntityActivities(
    entityType,
    entityId,
    req.user.id,
    limit,
  );

  res
    .status(200)
    .json(new ApiResponse(200, activities, "Activities fetched successfully"));
});

export const getContextActivitiesController = asyncHandler(async (req, res) => {
  const { contextType, contextId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;

  if (!["Project", "Team"].includes(contextType)) {
    throw new ApiError(400, "Invalid context type");
  }

  const activities = await getContextActivities(
    contextType,
    contextId,
    req.user.id,
    limit,
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        activities,
        "Context activities fetched successfully",
      ),
    );
});

export const getUserActivityFeedController = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 30;

  const activities = await getUserActivityFeed(req.user.id, limit);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        activities,
        "User activity feed fetched successfully",
      ),
    );
});

export const getActorActivitiesController = asyncHandler(async (req, res) => {
  const { actorId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit) : 30;

  const activities = await getActorActivities(actorId, limit);

  res
    .status(200)
    .json(
      new ApiResponse(200, activities, "Actor activities fetched successfully"),
    );
});
