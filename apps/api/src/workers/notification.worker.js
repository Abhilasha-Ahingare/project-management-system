import { Worker } from "bullmq";
import Redis from "ioredis";
import env from "../config/env.js";
import Notification from "../model/notifications/notification.model.js";
import Task from "../model/tasks/task.model.js";
import { emitUserEvent } from "../realtime/socket.js";
import { sendNotificationEmail } from "../utils/email.service.js";
import {
  notificationQueue,
  isNotificationQueueEnabled,
} from "../queues/notification.queue.js";

let worker;

const createDueNotification = async (task) => {
  if (!task.assignee || task.dueReminderSentAt) return;
  const notification = await Notification.create({
    recipient: task.assignee._id,
    type: "in-app",
    title: "Task due soon",
    message: `Task "${task.title}" is due within the next 24 hours.`,
    entityType: "Task",
    entityId: task._id,
    metadata: { dueDate: task.dueDate.toISOString() },
  });
  emitUserEvent(
    task.assignee._id.toString(),
    "notification:created",
    notification,
  );
  task.dueReminderSentAt = new Date();
  await task.save();
};

export const startNotificationWorker = async () => {
  if (!isNotificationQueueEnabled || worker) return false;
  const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  worker = new Worker(
    "projecthub-notifications",
    async (job) => {
      if (job.name === "notification-email") {
        const notification = await Notification.findOne({
          _id: job.data.notificationId,
          isActive: true,
        }).populate("recipient", "name email");
        if (notification?.recipient) await sendNotificationEmail(notification);
        return;
      }
      if (job.name === "due-date-scan") {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const tasks = await Task.find({
          isActive: true,
          status: { $ne: "done" },
          assignee: { $ne: null },
          dueDate: { $gte: now, $lte: tomorrow },
          dueReminderSentAt: null,
        }).populate("assignee", "name email");
        for (const task of tasks) await createDueNotification(task);
      }
    },
    { connection },
  );
  worker.on("failed", (job, error) => {
    console.error("[ProjectHub Queue] notification job failed", {
      jobId: job?.id,
      message: error.message,
    });
  });
  await notificationQueue.waitUntilReady();
  return true;
};
