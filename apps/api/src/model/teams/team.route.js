import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSystemAdmin } from "../../middleware/authorization.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import {
  createTeamController,
  getTeams,
  getTeam,
  updateTeamController,
  deleteTeamController,
  addTeamMemberController,
  removeTeamMemberController,
} from "./team.controller.js";
import {
  createTeamSchema,
  updateTeamSchema,
  addTeamMemberSchema,
} from "./team.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
  .route("/teams")
  .post(requireSystemAdmin, validate(createTeamSchema), createTeamController);
router.get("/teams", getTeams);

router
  .route("/teams/:teamId")
  .get(getTeam)
  .patch(requireSystemAdmin, validate(updateTeamSchema), updateTeamController)
  .delete(requireSystemAdmin, deleteTeamController);

router.post(
  "/teams/:teamId/members",
  requireSystemAdmin,
  validate(addTeamMemberSchema),
  addTeamMemberController,
);
router.delete(
  "/teams/:teamId/members/:userId",
  requireSystemAdmin,
  removeTeamMemberController,
);

export default router;
