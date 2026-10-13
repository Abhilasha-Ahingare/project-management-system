import dotenv from "dotenv";
import { durationToMilliseconds } from "../utils/security.helpers.js";

const envPath = new URL("../.env", import.meta.url);
dotenv.config({ path: envPath });

const requiredEnvVariables = ["MONGODB_URI", "JWT_SECRET"];
const nodeEnv = process.env.NODE_ENV || "development";

for (const variable of requiredEnvVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

if (Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
  console.warn(
    "[ProjectHub Config] JWT_SECRET is short; use at least 32 random bytes for stronger signing.",
  );
}

const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (
  !Number.isInteger(trustProxyHops) ||
  trustProxyHops < 0 ||
  trustProxyHops > 10
) {
  throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
}
const refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";
const refreshTokenTtlMs = durationToMilliseconds(refreshTokenExpiresIn);
if (refreshTokenTtlMs > 30 * 24 * 60 * 60 * 1000) {
  throw new Error("REFRESH_TOKEN_EXPIRES_IN must not exceed 30d");
}
const allowedOrigins = [clientUrl];
if (nodeEnv !== "production") {
  allowedOrigins.push("http://localhost:5173", "http://localhost:5174", "http://localhost:5175");
}

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,

  mongodbUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL || "",

  jwtSecret: process.env.JWT_SECRET,
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  refreshTokenExpiresIn,
  refreshTokenTtlMs,
  trustProxyHops,
  refreshTokenCookieName:
    process.env.REFRESH_TOKEN_COOKIE_NAME || "projecthub_refresh_token",

  clientUrl,
  allowedOrigins: [...new Set(allowedOrigins)],

  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpSecure: process.env.SMTP_SECURE === "true",
  mailFrom: process.env.MAIL_FROM || "ProjectHub <no-reply@projecthub.local>",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

export default env;
