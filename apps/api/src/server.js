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
    startInvitationExpiryJob();
    await verifyEmailTransport();
    await startNotificationWorker();
    await scheduleDueDateScan();

    httpServer.listen(env.port, () => {
      console.info("[ProjectHub API] started", {
        port: env.port,
        nodeEnv: env.nodeEnv,
      });
    });
  } catch (error) {
    console.error("[ProjectHub API] failed to start", {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

startServer();
