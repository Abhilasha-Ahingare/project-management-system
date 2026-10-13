import User from "../model/users/users.model.js";
import ApiError from "../utils/ApiError.js";

export const requireSystemAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("role isActive");

    if (!user || !user.isActive) {
      throw new ApiError(403, "Active user account required");
    }

    if (user.role !== "admin") {
      throw new ApiError(403, "Administrator access required");
    }

    next();
  } catch (error) {
    next(error);
  }
};
