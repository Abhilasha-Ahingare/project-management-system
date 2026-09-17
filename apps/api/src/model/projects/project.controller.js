import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";

import {
  createProject,
  getProjectsForUser,
  getProjectById,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
} from "./project.service.js";

export const getProjects = asyncHandler(async (req, res) => {
  const projects = await getProjectsForUser(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, projects, "Projects fetched successfully"));
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await getProjectById(req.params.projectId, req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, project, "Project fetched successfully"));
});

export const createProjectController = asyncHandler(async (req, res) => {
  const project = await createProject(req.body, req.user.id);

  res
    .status(201)
    .json(new ApiResponse(201, project, "Project created successfully"));
});

export const updateProjectController = asyncHandler(async (req, res) => {
  const project = await updateProject(
    req.params.projectId,
    req.body,
    req.user.id,
  );

  res
    .status(200)
    .json(new ApiResponse(200, project, "Project updated successfully"));
});

export const deleteProjectController = asyncHandler(async (req, res) => {
  const result = await deleteProject(req.params.projectId, req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, result, "Project deleted successfully"));
});

export const addProjectMemberController = asyncHandler(async (req, res) => {
  const project = await addProjectMember(
    req.params.projectId,
    req.body,
    req.user.id,
  );
  res
    .status(201)
    .json(
      new ApiResponse(201, project, "Project invitation sent successfully"),
    );
});

export const removeProjectMemberController = asyncHandler(async (req, res) => {
  const project = await removeProjectMember(
    req.params.projectId,
    req.params.userId,
    req.user.id,
  );
  res
    .status(200)
    .json(new ApiResponse(200, project, "Project member removed successfully"));
});
