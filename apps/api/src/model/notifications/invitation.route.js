import express from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import {
  createInvitationController,
  getPendingInvitationsController,
  respondToInvitationController,
} from "./invitation.controller.js";
import {
  createInvitationSchema,
  respondInvitationSchema,
} from "./invitation.validation.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/invitations", getPendingInvitationsController);
router.post(
  "/invitations",
  validate(createInvitationSchema),
  createInvitationController,
);
router.patch(
  "/invitations/:invitationId/respond",
  validate(respondInvitationSchema),
  respondToInvitationController,
);

export default router;
