import { createServer } from "node:http";

import app from "./app.js";
import env from "./config/env.js";
import connectDatabase from "./config/databse.js";
import { initializeRealtime } from "./realtime/socket.js";
import { startInvitationExpiryJob } from "./jobs/invitation-expiry.job.js";
import { scheduleDueDateScan } from "./queues/notification.queue.js";
import { startNotificationWorker } from "./workers/notification.worker.js";
import { verifyEmailTransport } from "./utils/email.service.js";

const startServer = async () => {
  try {
    await connectDatabase();

    const httpServer = createServer(app);
    initializeRealtime(httpServer);
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(env.port);
    });

    console.info("[ProjectHub API] started", {
      port: env.port,
      nodeEnv: env.nodeEnv,
    });
    startInvitationExpiryJob();
    await verifyEmailTransport();
    await startNotificationWorker();
    await scheduleDueDateScan();
  } catch (error) {
    const message =
      error.code === "EADDRINUSE"
        ? `Port ${env.port} is already in use. Stop the other ProjectHub API process or set PORT to a free port before starting another instance.`
        : error.message;
    console.error("[ProjectHub API] failed to start", {
      message,
      stack: env.nodeEnv === "development" ? error.stack : undefined,
    });
    process.exit(1);
  }
};

startServer();
