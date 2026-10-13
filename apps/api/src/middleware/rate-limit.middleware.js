import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import env from "../config/env.js";
import { RedisFixedWindowStore } from "../utils/redis-rate-limit.store.js";

const redisClient = env.redisUrl
  ? new Redis(env.redisUrl, {
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    })
  : null;
redisClient?.on("error", (error) => {
  if (env.nodeEnv === "development") {
    console.warn("[ProjectHub Rate Limit] Redis store unavailable", {
      message: error.message,
    });
  }
});

const createLimiter = (limit, windowMs, message) =>
  rateLimit({
    windowMs,
    limit,
    passOnStoreError: env.nodeEnv !== "production",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(redisClient
      ? {
          store: new RedisFixedWindowStore(
            redisClient,
            `projecthub:${message}`,
          ),
        }
      : {}),
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        statusCode: 429,
        message,
        errors: [],
      }),
  });

export const apiRateLimiter = createLimiter(
  600,
  15 * 60 * 1000,
  "Too many API requests. Please try again later.",
);

export const authenticationRateLimiter = createLimiter(
  10,
  15 * 60 * 1000,
  "Too many sign-in attempts. Please try again later.",
);

export const refreshRateLimiter = createLimiter(
  60,
  15 * 60 * 1000,
  "Too many token refresh attempts. Please try again later.",
);

export const aiRateLimiter = createLimiter(
  10,
  60 * 60 * 1000,
  "AI request limit reached. Please try again later.",
);
