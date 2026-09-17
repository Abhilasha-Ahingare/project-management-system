import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";

import {
  getCurrentUser,
  getAllUsers,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  searchUsers,
} from "./users.service.js";

export const getMe = asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "Current user fetched successfully"));
});

export const getUsers = asyncHandler(async (req, res) => {
  const users = await getAllUsers();
  res
    .status(200)
    .json(new ApiResponse(200, users, "Users fetched successfully"));
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await createManagedUser(req.body);
  res.status(201).json(new ApiResponse(201, user, "User created successfully"));
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await updateManagedUser(
    req.params.userId,
    req.body,
    req.user.id,
  );
  res.status(200).json(new ApiResponse(200, user, "User updated successfully"));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const result = await deleteManagedUser(req.params.userId, req.user.id);
  res
    .status(200)
    .json(new ApiResponse(200, result, "User deleted successfully"));
});

export const searchUserController = asyncHandler(async (req, res) => {
  const users = await searchUsers(req.query.q || "", req.user.id);
  res
    .status(200)
    .json(new ApiResponse(200, users, "Users searched successfully"));
});
