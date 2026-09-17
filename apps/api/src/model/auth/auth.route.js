import express from "express";

import { register, login, refresh, logout } from "./auth.controller.js";

import validate from "../../middleware/validation.middleware.js";

import { registerSchema, loginSchema } from "./auth.validations.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);

router.post("/login", validate(loginSchema), login);

router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
