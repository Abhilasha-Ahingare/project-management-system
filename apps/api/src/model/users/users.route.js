import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSystemAdmin } from "../../middleware/authorization.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import { createUserSchema, updateUserSchema } from "./users.validation.js";
import {
  getMe,
  getUsers,
  createUser,
  updateUser,
  searchUserController,
  deleteUser,
} from "./users.controller.js";

const router = express.Router();

router.get("/me", authMiddleware, getMe);
router.get("/search", authMiddleware, searchUserController);
router.get("/", authMiddleware, getUsers);
router.post(
  "/",
  authMiddleware,
  requireSystemAdmin,
  validate(createUserSchema),
  createUser,
);
router.patch(
  "/:userId",
  authMiddleware,
  requireSystemAdmin,
  validate(updateUserSchema),
  updateUser,
);
router.delete("/:userId", authMiddleware, requireSystemAdmin, deleteUser);

export default router;
