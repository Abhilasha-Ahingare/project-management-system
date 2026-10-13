import bcrypt from "bcryptjs";
import User from "./users.model.js";
import Team from "../teams/team.model.js";
import Project from "../projects/project.model.js";
import ApiError from "../../utils/ApiError.js";
import { escapeRegex } from "../../utils/security.helpers.js";

export const getCurrentUser = async (userId) => {
  const user = await User.findById(userId).select("-password");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

export const getAllUsers = async (userId) => {
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  const query =
    actor.role === "admin" ? User.find() : User.find({ isActive: true });
  return query
    .select(
      actor.role === "admin" ? "-password" : "name email avatar designation",
    )
    .sort({ createdAt: -1 })
    .limit(500);
};

export const createManagedUser = async (payload) => {
  const existingUser = await User.findOne({ email: payload.email });

  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const user = await User.create({
    name: payload.name,
    email: payload.email,
    designation: payload.designation || "",
    password: await bcrypt.hash(payload.password, 12),
    role: payload.role || "user",
    contactNumber: payload.contactNumber || "",
    address: payload.address || "",
    isActive: payload.isActive !== undefined ? payload.isActive : true,
  });

  return User.findById(user._id).select("-password");
};

export const updateManagedUser = async (userId, payload, actorId) => {
  if (
    userId === actorId &&
    (payload.role === "user" || payload.isActive === false)
  ) {
    throw new ApiError(400, "You cannot remove your own administrator access");
  }

  const user = await User.findById(userId).select("+password");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (payload.email && payload.email !== user.email) {
    const duplicate = await User.findOne({
      email: payload.email,
      _id: { $ne: userId },
    });

    if (duplicate) {
      throw new ApiError(409, "Email is already registered");
    }
  }

  for (const field of [
    "name",
    "email",
    "designation",
    "role",
    "contactNumber",
    "address",
    "isActive",
  ]) {
    if (payload[field] !== undefined) {
      user[field] = payload[field];
    }
  }

  if (payload.password) {
    user.password = await bcrypt.hash(payload.password, 12);
  }

  await user.save();
  return User.findById(user._id).select("-password");
};

export const deleteManagedUser = async (userId, actorId) => {
  if (userId === actorId) {
    throw new ApiError(400, "You cannot delete your own account");
  }

  const user = await User.findById(userId).select("role");
  if (!user) throw new ApiError(404, "User not found");
  if (user.role === "admin") {
    throw new ApiError(
      400,
      "Administrator accounts must be deactivated instead",
    );
  }

  await Promise.all([
    Team.updateMany({}, { $pull: { members: { user: userId } } }),
    Project.updateMany({}, { $pull: { members: { user: userId } } }),
    Project.updateMany({}, { $pull: { collaborators: { user: userId } } }),
    User.deleteOne({ _id: userId }),
  ]);

  return { deleted: true };
};

export const searchUsers = async (query, userId) => {
  const text = String(query || "")
    .trim()
    .slice(0, 80);
  if (text.length < 2) return [];
  const escapedText = escapeRegex(text);
  return User.find({
    isActive: true,
    _id: { $ne: userId },
    $or: [
      { name: { $regex: escapedText, $options: "i" } },
      { email: { $regex: escapedText, $options: "i" } },
      { designation: { $regex: escapedText, $options: "i" } },
    ],
  })
    .select("name email designation")
    .limit(10);
};
