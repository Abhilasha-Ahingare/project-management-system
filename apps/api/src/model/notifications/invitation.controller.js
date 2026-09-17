import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createInvitation,
  getPendingInvitations,
  respondToInvitation,
} from "./invitation.service.js";

export const createInvitationController = asyncHandler(async (req, res) => {
  const invitation = await createInvitation({
    ...req.body,
    invitedBy: req.user.id,
  });
  res
    .status(201)
    .json(new ApiResponse(201, invitation, "Invitation sent successfully"));
});

export const getPendingInvitationsController = asyncHandler(
  async (req, res) => {
    const invitations = await getPendingInvitations(req.user.id);
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          invitations,
          "Pending invitations fetched successfully",
        ),
      );
  },
);

export const respondToInvitationController = asyncHandler(async (req, res) => {
  const invitation = await respondToInvitation(
    req.params.invitationId,
    req.user.id,
    req.body.decision,
  );
  res
    .status(200)
    .json(new ApiResponse(200, invitation, `Invitation ${req.body.decision}`));
});
