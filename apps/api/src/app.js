import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";

import env from "./config/env.js";
import notFoundMiddleware from "./middleware/not-found.middleware.js";
import errorMiddleware from "./middleware/error.middleware.js";
import userRoutes from "./model/users/users.route.js";
import authRoutes from "./model/auth/auth.route.js";
import teamRoutes from "./model/teams/team.route.js";
import projectRoutes from "./model/projects/project.route.js";
import taskRoutes from "./model/tasks/task.route.js";
import activityRoutes from "./model/activities/activity.route.js";
import notificationRoutes from "./model/notifications/notification.route.js";
import invitationRoutes from "./model/notifications/invitation.route.js";
import fileRoutes from "./model/files/file.route.js";
import chatRoutes from "./model/chat/chat.route.js";
import todoRoutes from "./model/todos/todo.route.js";
import collaborationRoutes from "./model/collaboration/collaboration.route.js";
import { apiRateLimiter } from "./middleware/rate-limit.middleware.js";

const app = express();
if (env.trustProxyHops > 0) app.set("trust proxy", env.trustProxyHops);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = env.allowedOrigins || [env.clientUrl];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("Not allowed by CORS");
      error.statusCode = 403;
      callback(error);
    },
    credentials: true,
  }),
);

app.use("/api", apiRateLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(
  express.urlencoded({ extended: false, limit: "1mb", parameterLimit: 50 }),
);
app.use(cookieParser());

app.use((req, res, next) => {
  const startedAt = Date.now();

  console.info("[ProjectHub API] request started", {
    method: req.method,
    path: req.path,
  });

  res.on("finish", () => {
    console.info("[ProjectHub API] request finished", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: "ProjectHub API is healthy",
    data: { uptime: process.uptime() },
  });
});

if (env.nodeEnv === "development") {
  app.use(morgan("dev"));
}

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", teamRoutes);
app.use("/api", projectRoutes);
app.use("/api", taskRoutes);
app.use("/api", activityRoutes);
app.use("/api", notificationRoutes);
app.use("/api", invitationRoutes);
app.use("/api", fileRoutes);
app.use("/api", chatRoutes);
app.use("/api", todoRoutes);
app.use("/api", collaborationRoutes);
// 404 handler
app.use(notFoundMiddleware);

// Global error handler
app.use(errorMiddleware);

export default app;
