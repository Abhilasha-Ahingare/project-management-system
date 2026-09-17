import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllUserNotifications,
} from "./notification.service.js";

export const createNotificationController = asyncHandler(async (req, res) => {
  const notification = await createNotification(req.body, req.user.id);
  res
    .status(201)
    .json(
      new ApiResponse(201, notification, "Notification created successfully"),
    );
});

export const getNotificationsController = asyncHandler(async (req, res) => {
  const notifications = await getUserNotifications(req.user.id, req.query);
  res
    .status(200)
    .json(
      new ApiResponse(200, notifications, "Notifications fetched successfully"),
    );
});

export const markNotificationAsReadController = asyncHandler(
  async (req, res) => {
    const notification = await markNotificationAsRead(
      req.params.notificationId,
      req.user.id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, notification, "Notification marked as read"));
  },
);

export const markAllNotificationsAsReadController = asyncHandler(
  async (req, res) => {
    const result = await markAllNotificationsAsRead(req.user.id);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Notifications marked as read"));
  },
);

export const deleteNotificationController = asyncHandler(async (req, res) => {
  const result = await deleteNotification(
    req.params.notificationId,
    req.user.id,
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Notification deleted successfully"));
});

export const deleteAllNotificationsController = asyncHandler(
  async (req, res) => {
    const result = await deleteAllUserNotifications(req.user.id);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Notifications cleared successfully"));
  },
);
