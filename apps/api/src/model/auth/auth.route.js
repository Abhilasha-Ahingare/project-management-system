import express from "express";

import { register, login, refresh, logout } from "./auth.controller.js";

import validate from "../../middleware/validation.middleware.js";

import { registerSchema, loginSchema } from "./auth.validations.js";
import {
  authenticationRateLimiter,
  refreshRateLimiter,
} from "../../middleware/rate-limit.middleware.js";

const router = express.Router();

router.post(
  "/register",
  authenticationRateLimiter,
  validate(registerSchema),
  register,
);

router.post("/login", authenticationRateLimiter, validate(loginSchema), login);

router.post("/refresh", refreshRateLimiter, refresh);
router.post("/logout", logout);

export default router;
