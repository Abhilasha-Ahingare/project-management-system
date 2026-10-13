import env from "../config/env.js";

const errorMiddleware = (err, req, res, next) => {
  const statusCode =
    err.statusCode ||
    (err.code === "LIMIT_FILE_SIZE" || err.status === 413
      ? 413
      : err.name === "MulterError" || err.status === 400
        ? 400
        : 500);

  console.error("[ProjectHub API] request failed", {
    method: req.method,
    path: req.path,
    statusCode,
    message: err.message,
    stack: env.nodeEnv === "development" ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    statusCode,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
    ...(env.nodeEnv === "development" && { stack: err.stack }),
  });
};

export default errorMiddleware;
