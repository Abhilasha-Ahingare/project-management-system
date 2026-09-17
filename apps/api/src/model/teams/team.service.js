import Team from "./team.model.js";
import Project from "../projects/project.model.js";
import User from "../users/users.model.js";
import ApiError from "../../utils/ApiError.js";
import { createInvitation } from "../notifications/invitation.service.js";
import Invitation from "../notifications/invitation.model.js";

const slugify = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
};

export const createTeam = async (payload, userId) => {
  const actor = await User.findById(userId).select("email role isActive");
  if (!actor?.isActive || actor.role !== "admin")
    throw new ApiError(403, "Only an administrator can create teams");

  let project = null;
  if (payload.projectId) {
    project = await Project.findOne({
      _id: payload.projectId,
      isActive: true,
    });
    if (!project) throw new ApiError(404, "Project not found");
  }

  const teamName = payload.name?.trim();
  if (!teamName) {
    throw new ApiError(400, "Team name is required");
  }

  const slugBase = slugify(teamName);
  let slug = slugBase || "team";

  const existing = await Team.findOne({
    slug,
    isActive: true,
  });

  if (existing) {
    let counter = 1;
    while (true) {
      const candidate = `${slug}-${counter}`;
      const found = await Team.findOne({
        slug: candidate,
        isActive: true,
      });

      if (!found) {
        slug = candidate;
        break;
      }

      counter += 1;
    }
  }

  const team = await Team.create({
    name: teamName,
    slug,
    description: payload.description || "",
    project: project?._id || null,
    lead: userId,
    members: [{ user: userId, role: "lead", joinedAt: new Date() }],
  });

  if (project) {
    await Team.updateMany(
      { project: project._id },
      { $set: { project: null } },
    );
    await Project.updateMany(
      { team: team._id, _id: { $ne: project._id } },
      { $set: { team: null } },
    );
    await Project.updateOne({ _id: project._id }, { $set: { team: team._id } });
  }

  const invitationResults = await Promise.allSettled(
    [...new Set(payload.memberEmails || [])]
      .filter((email) => email !== actor.email)
      .map((email) =>
        createInvitation({
          targetType: "Team",
          targetId: team._id,
          email,
          role: "member",
          invitedBy: userId,
        }),
      ),
  );
  const invitationErrors = invitationResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "Invitation failed");

  return {
    team: await team.populate([
      { path: "project", select: "name slug" },
      { path: "lead", select: "name email avatar" },
      { path: "members.user", select: "name email avatar designation" },
    ]),
    invitationsSent: invitationResults.filter(
      (result) => result.status === "fulfilled",
    ).length,
    invitationErrors,
  };
};

export const getTeamsForUser = async (userId) => {
  const user = await User.findById(userId).select("role isActive");
  if (!user?.isActive) throw new ApiError(403, "Active user account required");
  const teamQuery = { isActive: true };

  if (user.role !== "admin") {
    const accessibleProjectIds = await Project.find({
      isActive: true,
      $or: [
        { owner: userId },
        { "members.user": userId },
        { "collaborators.user": userId, "collaborators.status": "accepted" },
      ],
    }).distinct("_id");
    teamQuery.$or = [
      { lead: userId },
      { "members.user": userId },
      { project: { $in: accessibleProjectIds } },
    ];
  }

  const teams = await Team.find(teamQuery)
    .populate("lead", "name email avatar")
    .populate("members.user", "name email avatar")
    .populate("project", "name slug")
    .sort({ createdAt: -1 });
  const teamIds = teams.map((team) => team._id);
  const pending = await Invitation.find({
    targetType: "Team",
    targetId: { $in: teamIds },
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).populate("recipient", "name email avatar");
  return teams.map((team) => ({
    ...team.toObject(),
    pendingMembers: pending
      .filter(
        (invitation) => invitation.targetId.toString() === team._id.toString(),
      )
      .map((invitation) => ({
        _id: invitation.recipient?._id,
        name: invitation.recipient?.name,
        email: invitation.recipient?.email,
        status: "pending",
      })),
  }));
};

export const getTeamById = async (teamId, userId) => {
  const team = await Team.findOne({
    _id: teamId,
    isActive: true,
  })
    .populate("lead", "name email avatar")
    .populate("members.user", "name email avatar");

  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const user = await User.findById(userId).select("role isActive");
  const hasAccess =
    user?.isActive &&
    (user.role === "admin" ||
      team.lead.toString() === userId ||
      team.members.some((member) => member.user.toString() === userId));

  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this team");
  }

  return team;
};

export const updateTeam = async (teamId, payload, userId) => {
  const [team, actor] = await Promise.all([
    Team.findOne({ _id: teamId, isActive: true }),
    User.findById(userId).select("role isActive"),
  ]);
  const canManage =
    team &&
    actor?.isActive &&
    (actor.role === "admin" || team.lead.toString() === userId || false);

  if (!canManage) throw new ApiError(403, "Team management access required");

  if (payload.name) {
    const name = payload.name.trim();
    if (!name) {
      throw new ApiError(400, "Team name cannot be empty");
    }

    const slug = slugify(name);
    const duplicate = await Team.findOne({
      slug,
      _id: { $ne: teamId },
      isActive: true,
    });

    if (duplicate) {
      throw new ApiError(409, "Team name already exists");
    }

    team.name = name;
    team.slug = slug;
  }

  if (payload.description !== undefined) {
    team.description = payload.description.trim();
  }

  if (payload.projectId !== undefined) {
    if (!payload.projectId) {
      if (team.project)
        await Project.updateOne(
          { _id: team.project },
          { $set: { team: null } },
        );
      team.project = null;
    } else {
      const project = await Project.findOne({
        _id: payload.projectId,
        isActive: true,
      });
      if (!project) throw new ApiError(404, "Project not found");
      if (team.project && team.project.toString() !== project._id.toString()) {
        await Project.updateOne(
          { _id: team.project },
          { $set: { team: null } },
        );
      }
      await Project.updateMany(
        { team: team._id, _id: { $ne: project._id } },
        { $set: { team: null } },
      );
      project.team = team._id;
      await project.save();
      team.project = project._id;
    }
  }

  await team.save();
  const invitationResults = await Promise.allSettled(
    [...new Set(payload.memberEmails || [])].map((email) =>
      createInvitation({
        targetType: "Team",
        targetId: team._id,
        email,
        role: "member",
        invitedBy: userId,
      }),
    ),
  );
  const invitationErrors = invitationResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "Invitation failed");

  return team
    .populate([
      { path: "project", select: "name slug" },
      { path: "lead", select: "name email avatar" },
      { path: "members.user", select: "name email avatar designation" },
    ])
    .then((updatedTeam) => ({
      team: updatedTeam,
      invitationsSent: invitationResults.filter(
        (result) => result.status === "fulfilled",
      ).length,
      invitationErrors,
    }));
};

export const deleteTeam = async (teamId, userId) => {
  const [team, actor] = await Promise.all([
    Team.findOne({ _id: teamId, isActive: true }),
    User.findById(userId).select("role isActive"),
  ]);
  const canManage =
    team &&
    actor?.isActive &&
    (actor.role === "admin" || team.lead.toString() === userId || false);

  if (!canManage) throw new ApiError(403, "Team management access required");

  team.isActive = false;
  await team.save();

  return { deleted: true };
};

const getManageableTeam = async (teamId, userId) => {
  const [team, actor] = await Promise.all([
    Team.findOne({ _id: teamId, isActive: true }),
    User.findById(userId).select("role isActive"),
  ]);

  if (!team) throw new ApiError(404, "Team not found");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");

  const member = team.members.find((item) => item.user.toString() === userId);
  const canManage =
    actor.role === "admin" ||
    team.lead.toString() === userId ||
    member?.role === "admin";

  if (!canManage) throw new ApiError(403, "Team management access required");
  return { team };
};

export const addTeamMember = async (teamId, payload, userId) => {
  return createInvitation({
    targetType: "Team",
    targetId: teamId,
    email: payload.email,
    role: payload.role,
    invitedBy: userId,
  });
};

export const removeTeamMember = async (teamId, memberId, userId) => {
  const { team } = await getManageableTeam(teamId, userId);
  if (team.lead.toString() === memberId) {
    throw new ApiError(400, "Team lead must be changed before removal");
  }

  const originalLength = team.members.length;
  team.members = team.members.filter(
    (item) => item.user.toString() !== memberId,
  );
  if (team.members.length === originalLength)
    throw new ApiError(404, "Team member not found");

  await team.save();
  return team.populate("members.user", "name email avatar designation");
};
