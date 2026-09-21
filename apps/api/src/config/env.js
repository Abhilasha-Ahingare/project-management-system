import dotenv from "dotenv";

const envPath = new URL("../.env", import.meta.url);
dotenv.config({ path: envPath });

const requiredEnvVariables = ["MONGODB_URI", "JWT_SECRET"];

for (const variable of requiredEnvVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",

  mongodbUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL || "",

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "3650d",
  refreshTokenCookieName:
    process.env.REFRESH_TOKEN_COOKIE_NAME || "projecthub_refresh_token",

  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  allowedOrigins: [
    process.env.CLIENT_URL,
    "http://localhost:5173",
    "http://localhost:5174",
  ].filter(Boolean),

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
