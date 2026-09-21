import Project from "./project.model.js";
import Team from "../teams/team.model.js";
import { CollaborationBoard } from "../collaboration/collaboration.model.js";
import User from "../users/users.model.js";
import ApiError from "../../utils/ApiError.js";
import {
  logProjectCreated,
  logProjectUpdated,
} from "../activities/activity.service.js";
import { createInvitation } from "../notifications/invitation.service.js";
import Invitation from "../notifications/invitation.model.js";
import { hasAccessibleProject } from "./project-access.service.js";

const slugify = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

export const createProject = async (payload, userId) => {
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  if (actor.role !== "admin") {
    throw new ApiError(403, "Only an administrator can create projects");
  }

  let team = null;
  if (payload.teamId) {
    team = await Team.findOne({
      _id: payload.teamId,
      isActive: true,
    });

    if (!team) {
      throw new ApiError(404, "Team not found");
    }
  }

  const projectName = payload.name?.trim();
  if (!projectName) {
    throw new ApiError(400, "Project name is required");
  }

  const slugBase = slugify(projectName);
  let slug = slugBase || "project";

  const existing = await Project.findOne({
    slug,
    isActive: true,
  });

  if (existing) {
    let counter = 1;
    while (true) {
      const candidate = `${slug}-${counter}`;
      const duplicate = await Project.findOne({
        slug: candidate,
        isActive: true,
      });

      if (!duplicate) {
        slug = candidate;
        break;
      }

      counter += 1;
    }
  }

  const project = await Project.create({
    name: projectName,
    slug,
    description: payload.description || "",
    team: team ? team._id : null,
    owner: userId,
    members: [{ user: userId, role: "owner", joinedAt: new Date() }],
    status: payload.status || "planning",
    priority: payload.priority || "medium",
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
  });

  await logProjectCreated(project._id, project.name, userId);

  return project;
};

export const getProjectsForUser = async (userId) => {
  const user = await User.findById(userId).select("role isActive");
  if (!user?.isActive) throw new ApiError(403, "Active user account required");
  const projectQuery = { isActive: true };
  if (user.role !== "admin") {
    const teamIds = await Team.find({
      isActive: true,
      $or: [{ lead: userId }, { "members.user": userId }],
    }).distinct("_id");
    const collaborationProjectIds = await CollaborationBoard.find({
      isActive: true,
      participants: {
        $elemMatch: { user: userId, status: "accepted" },
      },
    }).distinct("project");
    projectQuery.$or = [
      { owner: userId },
      { "members.user": userId },
      { "collaborators.user": userId, "collaborators.status": "accepted" },
      { team: { $in: teamIds } },
      { _id: { $in: collaborationProjectIds } },
    ];
  }
  return Project.find(projectQuery)
    .populate("owner", "name email avatar")
    .populate({
      path: "team",
      select: "name slug lead members",
      populate: [
        { path: "lead", select: "name email avatar" },
        { path: "members.user", select: "name email avatar designation" },
      ],
    })
    .populate("members.user", "name email avatar")
    .populate("collaborators.user", "name email avatar")
    .sort({ createdAt: -1 });
};

export const getProjectById = async (projectId, userId) => {
  const project = await Project.findOne({
    _id: projectId,
    isActive: true,
  })
    .populate({
      path: "team",
      select: "name slug lead members",
      populate: [
        { path: "lead", select: "name email avatar" },
        { path: "members.user", select: "name email avatar designation" },
      ],
    })
    .populate("owner", "name email avatar")
    .populate("members.user", "name email avatar")
    .populate("collaborators.user", "name email avatar");

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  if (!(await hasAccessibleProject(project._id, userId))) {
    throw new ApiError(403, "You do not have access to this project");
  }

  const pendingCollaborators = await Invitation.find({
    targetType: "CollaborationProject",
    targetId: project._id,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).populate("recipient", "name email avatar");

  return {
    ...project.toObject(),
    pendingCollaborators: pendingCollaborators.map((invitation) => ({
      _id: invitation.recipient?._id,
      name: invitation.recipient?.name,
      email: invitation.recipient?.email,
      avatar: invitation.recipient?.avatar,
      status: "pending",
      permission: invitation.role,
    })),
  };
};

export const updateProject = async (projectId, payload, userId) => {
  const project = await Project.findOne({ _id: projectId, isActive: true });
  const actor = await User.findById(userId).select("role isActive");

  if (!project || !actor?.isActive) {
    throw new ApiError(404, "Project not found");
  }
  if (actor.role !== "admin" && project.owner.toString() !== userId) {
    throw new ApiError(403, "Only the project owner can update this project");
  }

  const changes = {};

  if (payload.name) {
    const name = payload.name.trim();
    if (!name) {
      throw new ApiError(400, "Project name cannot be empty");
    }

    const slug = slugify(name);
    const duplicate = await Project.findOne({
      slug,
      _id: { $ne: projectId },
      isActive: true,
    });

    if (duplicate) {
      throw new ApiError(409, "Project name already exists");
    }

    if (name !== project.name) {
      changes.name = { oldValue: project.name, newValue: name };
    }
    project.name = name;
    project.slug = slug;
  }

  if (payload.description !== undefined) {
    if (payload.description.trim() !== project.description) {
      changes.description = {
        oldValue: project.description,
        newValue: payload.description.trim(),
      };
    }
    project.description = payload.description.trim();
  }

  if (payload.teamId !== undefined) {
    if (!payload.teamId) {
      project.team = null;
    } else {
      const team = await Team.findOne({
        _id: payload.teamId,
        isActive: true,
      });
      if (!team) throw new ApiError(404, "Team not found");
      project.team = team._id;
    }
  }

  if (payload.status) {
    project.status = payload.status;
  }

  if (payload.priority) {
    project.priority = payload.priority;
  }

  if (payload.startDate !== undefined) {
    project.startDate = payload.startDate || null;
  }

  if (payload.endDate !== undefined) {
    project.endDate = payload.endDate || null;
  }

  await project.save();
  if (
    Object.keys(changes).length ||
    payload.status ||
    payload.priority ||
    payload.teamId !== undefined ||
    payload.startDate !== undefined ||
    payload.endDate !== undefined
  ) {
    await logProjectUpdated(project._id, project.name, userId, changes);
  }
  return project;
};

export const deleteProject = async (projectId, userId) => {
  const [project, actor] = await Promise.all([
    Project.findOne({ _id: projectId, isActive: true }),
    User.findById(userId).select("role isActive"),
  ]);

  if (!project || !actor?.isActive) {
    throw new ApiError(404, "Project not found");
  }
  if (actor.role !== "admin" && project.owner.toString() !== userId) {
    throw new ApiError(403, "Only the project owner can delete this project");
  }

  project.isActive = false;
  await project.save();

  return { deleted: true };
};

const getManageableProject = async (projectId, userId) => {
  const [project, actor] = await Promise.all([
    Project.findOne({ _id: projectId, isActive: true }),
    User.findById(userId).select("role isActive"),
  ]);
  if (!project) throw new ApiError(404, "Project not found");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");

  const canManage =
    actor.role === "admin" || project.owner.toString() === userId;
  if (!canManage) throw new ApiError(403, "Project management access required");
  return { project };
};

export const addProjectMember = async (projectId, payload, userId) => {
  return createInvitation({
    targetType: "Project",
    targetId: projectId,
    email: payload.email,
    role: payload.role,
    invitedBy: userId,
  });
};

export const removeProjectMember = async (projectId, memberId, userId) => {
  const { project } = await getManageableProject(projectId, userId);
  if (project.owner.toString() === memberId) {
    throw new ApiError(400, "Project owner cannot be removed");
  }
  const originalLength = project.members.length;
  project.members = project.members.filter(
    (item) => item.user.toString() !== memberId,
  );
  if (project.members.length === originalLength)
    throw new ApiError(404, "Project member not found");

  await project.save();
  return project.populate("members.user", "name email avatar designation");
};
