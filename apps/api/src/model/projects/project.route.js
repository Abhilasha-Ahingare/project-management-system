import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSystemAdmin } from "../../middleware/authorization.middleware.js";
import {
  validateObjectIdParam,
  default as validate,
} from "../../middleware/validation.middleware.js";
import {
  createProjectController,
  getProjects,
  getProject,
  updateProjectController,
  deleteProjectController,
  addProjectMemberController,
  removeProjectMemberController,
} from "./project.controller.js";
import {
  createProjectSchema,
  updateProjectSchema,
  addProjectMemberSchema,
} from "./project.validation.js";

const router = express.Router();
router.param("projectId", validateObjectIdParam("projectId"));
router.param("userId", validateObjectIdParam("userId"));

router.use(authMiddleware);

router
  .route("/projects")
  .post(
    requireSystemAdmin,
    validate(createProjectSchema),
    createProjectController,
  );
router.get("/projects", getProjects);

router
  .route("/projects/:projectId")
  .get(getProject)
  .patch(validate(updateProjectSchema), updateProjectController)
  .delete(deleteProjectController);

router.post(
  "/projects/:projectId/members",
  validate(addProjectMemberSchema),
  addProjectMemberController,
);
router.delete(
  "/projects/:projectId/members/:userId",
  removeProjectMemberController,
);

export default router;
