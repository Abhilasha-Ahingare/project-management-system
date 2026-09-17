import jwt from "jsonwebtoken";

import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication required");
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, env.jwtSecret);

    req.user = {
      id: decoded.userId,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new ApiError(401, "Invalid token"));
    }

    if (error.name === "TokenExpiredError") {
      return next(new ApiError(401, "Token expired"));
    }

    next(error);
  }
};

export default authMiddleware;