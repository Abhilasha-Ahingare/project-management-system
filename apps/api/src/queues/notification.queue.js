import { Queue } from "bullmq";
import Redis from "ioredis";
import env from "../config/env.js";

let redis;
let notificationQueue;

if (env.redisUrl) {
  redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  notificationQueue = new Queue("projecthub-notifications", {
    connection: redis,
  });
}

export const isNotificationQueueEnabled = Boolean(notificationQueue);

export const enqueueNotificationEmail = async (notificationId) => {
  if (!notificationQueue) return false;
  await notificationQueue.add(
    "notification-email",
    { notificationId: notificationId.toString() },
    {
      jobId: `notification-email:${notificationId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
  return true;
};

export const scheduleDueDateScan = async () => {
  if (!notificationQueue) return false;
  await notificationQueue.add(
    "due-date-scan",
    {},
    { jobId: `due-date-scan-now:${Date.now()}`, removeOnComplete: 100 },
  );
  await notificationQueue.add(
    "due-date-scan",
    {},
    {
      jobId: "due-date-scan",
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  return true;
};

export { notificationQueue };
