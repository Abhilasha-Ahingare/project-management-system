import jwt from "jsonwebtoken";

import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import User from "../model/users/users.model.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication required");
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    const user = await User.findOne({
      _id: decoded.userId,
      isActive: true,
    }).select("_id");
    if (!user) throw new ApiError(401, "Account is inactive or unavailable");

    req.user = {
      id: decoded.userId,
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenInvalidError"
    ) {
      return next(new ApiError(401, "Invalid token"));
    }

    if (error.name === "TokenExpiredError") {
      return next(new ApiError(401, "Token expired"));
    }

    next(error);
  }
};

export default authMiddleware;
