import Notification from "./notification.model.js";
import User from "../users/users.model.js";
import ApiError from "../../utils/ApiError.js";
import { emitUserEvent } from "../../realtime/socket.js";
import {
  enqueueNotificationEmail,
  isNotificationQueueEnabled,
} from "../../queues/notification.queue.js";
import { sendNotificationEmail } from "../../utils/email.service.js";

export const notifySafely = async (payload, recipientId) => {
  if (!recipientId) return null;

  try {
    const notification = await createNotification(payload, recipientId);
    emitUserEvent(recipientId.toString(), "notification:created", notification);
    if (payload.sendEmail) {
      const queued = await enqueueNotificationEmail(notification._id);
      if (!queued && !isNotificationQueueEnabled) {
        const emailNotification = await Notification.findById(notification._id)
          .populate("recipient", "name email")
          .lean();
        if (emailNotification) await sendNotificationEmail(emailNotification);
      }
    }
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
};

export const createNotification = async (payload, recipientId) => {
  const recipient = await User.findOne({ _id: recipientId, isActive: true });
  if (!recipient) throw new ApiError(404, "Notification recipient not found");

  return Notification.create({
    recipient: recipientId,
    type: payload.type || "in-app",
    title: payload.title?.trim(),
    message: payload.message?.trim(),
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    metadata: payload.metadata || {},
  });
};

export const getUserNotifications = async (userId, filters = {}) => {
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  const query = { recipient: userId, isActive: true };
  if (filters.unreadOnly === "true") query.isRead = false;

  return Notification.find(query)
    .populate("recipient", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(filters.limit) || 30, 100));
};

export const markNotificationAsRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId, isActive: true },
    { isRead: true, readAt: new Date() },
    { returnDocument: "after" },
  );
  if (!notification) throw new ApiError(404, "Notification not found");
  return notification;
};

export const markAllNotificationsAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isActive: true, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  return { updated: result.modifiedCount };
};

export const deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId, isActive: true },
    { isActive: false },
    { returnDocument: "after" },
  );
  if (!notification) throw new ApiError(404, "Notification not found");
  return { deleted: true };
};

export const deleteAllUserNotifications = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isActive: true },
    { $set: { isActive: false } },
  );
  return { deleted: result.modifiedCount };
};
