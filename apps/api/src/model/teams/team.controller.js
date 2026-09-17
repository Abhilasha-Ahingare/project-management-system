import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";

import {
  createTeam,
  getTeamsForUser,
  getTeamById,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
} from "./team.service.js";

export const getTeams = asyncHandler(async (req, res) => {
  const teams = await getTeamsForUser(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, teams, "Teams fetched successfully"));
});

export const getTeam = asyncHandler(async (req, res) => {
  const team = await getTeamById(req.params.teamId, req.user.id);

  res.status(200).json(new ApiResponse(200, team, "Team fetched successfully"));
});

export const createTeamController = asyncHandler(async (req, res) => {
  const team = await createTeam(
    {
      ...req.body,
    },
    req.user.id,
  );

  res.status(201).json(new ApiResponse(201, team, "Team created successfully"));
});

export const updateTeamController = asyncHandler(async (req, res) => {
  const team = await updateTeam(req.params.teamId, req.body, req.user.id);

  res.status(200).json(new ApiResponse(200, team, "Team updated successfully"));
});

export const deleteTeamController = asyncHandler(async (req, res) => {
  const result = await deleteTeam(req.params.teamId, req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, result, "Team deleted successfully"));
});

export const addTeamMemberController = asyncHandler(async (req, res) => {
  const team = await addTeamMember(req.params.teamId, req.body, req.user.id);
  res
    .status(201)
    .json(new ApiResponse(201, team, "Team invitation sent successfully"));
});

export const removeTeamMemberController = asyncHandler(async (req, res) => {
  const team = await removeTeamMember(
    req.params.teamId,
    req.params.userId,
    req.user.id,
  );
  res
    .status(200)
    .json(new ApiResponse(200, team, "Team member removed successfully"));
});
