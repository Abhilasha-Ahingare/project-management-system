import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSystemAdmin } from "../../middleware/authorization.middleware.js";
import {
  validateObjectIdParam,
  default as validate,
} from "../../middleware/validation.middleware.js";
import { createUserSchema, updateUserSchema } from "./users.validation.js";
import Joi from "joi";
import {
  getMe,
  getUsers,
  createUser,
  updateUser,
  searchUserController,
  deleteUser,
} from "./users.controller.js";

const router = express.Router();
router.param("userId", validateObjectIdParam("userId"));

router.get("/me", authMiddleware, getMe);
router.get(
  "/search",
  authMiddleware,
  validate(Joi.object({ q: Joi.string().trim().max(80).allow("") }), "query"),
  searchUserController,
);
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
