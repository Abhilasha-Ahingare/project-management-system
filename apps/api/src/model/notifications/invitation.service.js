import Invitation from "./invitation.model.js";
import Notification from "./notification.model.js";
import User from "../users/users.model.js";
import Project from "../projects/project.model.js";
import Team from "../teams/team.model.js";
import ApiError from "../../utils/ApiError.js";
import { sendInvitationEmail } from "../../utils/email.service.js";
import { notifySafely } from "./notification.service.js";
import { emitUserEvent } from "../../realtime/socket.js";
import { CollaborationBoard } from "../collaboration/collaboration.model.js";

const EXPIRY_HOURS = 24;

const getTarget = async (targetType, targetId) => {
  const Model =
    targetType === "Project" || targetType === "CollaborationProject"
      ? Project
      : targetType === "Team"
        ? Team
        : CollaborationBoard;
  const target = await Model.findOne({ _id: targetId, isActive: true });
  if (!target) throw new ApiError(404, `${targetType} not found`);
  return target;
};

const canInvite = async (targetType, target, userId) => {
  const actor = await User.findById(userId).select("name role isActive");

  if (!actor?.isActive) {
    throw new ApiError(403, "Invitation access denied");
  }

  if (
    (targetType === "Project" || targetType === "CollaborationProject") &&
    (actor.role === "admin" || target.owner.toString() === userId)
  ) {
    return { actor };
  }

  if (targetType === "CollaborationProject") {
    const isDirectMember = target.members?.some(
      (member) => member.user.toString() === userId,
    );
    const isAcceptedCollaborator = target.collaborators?.some(
      (collaborator) =>
        collaborator.user.toString() === userId &&
        collaborator.status === "accepted",
    );
    const isAssignedTeamMember = target.team
      ? await Team.exists({
          _id: target.team,
          isActive: true,
          $or: [{ lead: userId }, { "members.user": userId }],
        })
      : false;

    if (isDirectMember || isAcceptedCollaborator || isAssignedTeamMember) {
      return { actor };
    }
  }

  if (
    targetType === "Collaboration" &&
    target.createdBy.toString() === userId
  ) {
    return { actor };
  }

  if (
    targetType === "Team" &&
    (target.lead.toString() === userId ||
      target.members.some(
        (member) =>
          member.user.toString() === userId && member.role === "admin",
      ))
  ) {
    return { actor };
  }

  throw new ApiError(403, "You cannot invite members to this resource");
};

export const createInvitation = async ({
  targetType,
  targetId,
  email,
  role = "member",
  invitedBy,
  targetName,
}) => {
  const target = await getTarget(targetType, targetId);
  const { actor } = await canInvite(targetType, target, invitedBy);
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const recipient = await User.findOne({
    email: normalizedEmail,
    isActive: true,
  });

  if (!recipient) throw new ApiError(404, "Active user not found");
  if (recipient._id.toString() === invitedBy) {
    throw new ApiError(400, "You cannot invite yourself");
  }

  const alreadyMember =
    targetType !== "Collaboration" &&
    targetType !== "CollaborationProject" &&
    target.members.some(
      (member) => member.user.toString() === recipient._id.toString(),
    );
  const alreadyParticipant =
    targetType === "Collaboration" &&
    target.participants.some(
      (participant) =>
        participant.user.toString() === recipient._id.toString() &&
        participant.status !== "removed",
    );
  const alreadyCollaborator =
    targetType === "CollaborationProject" &&
    target.collaborators?.some(
      (collaborator) =>
        collaborator.user.toString() === recipient._id.toString() &&
        collaborator.status !== "removed",
    );
  if (
    alreadyParticipant ||
    alreadyCollaborator ||
    (targetType !== "Collaboration" &&
      targetType !== "CollaborationProject" &&
      (alreadyMember || target.owner?.toString() === recipient._id.toString()))
  ) {
    throw new ApiError(409, "User is already a member of this resource");
  }

  const pending = await Invitation.findOne({
    recipient: recipient._id,
    targetType,
    targetId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  if (pending) throw new ApiError(409, "An invitation is already pending");

  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);
  const invitation = await Invitation.create({
    recipient: recipient._id,
    invitedBy,
    targetType,
    targetId,
    targetName: targetName || target.name,
    role,
    expiresAt,
  });

  const notification = await Notification.create({
    recipient: recipient._id,
    type: "in-app",
    title: `You were invited to ${target.name}`,
    message: `${actor.name} invited you to join ${targetType.toLowerCase()} "${target.name}". Respond within 24 hours.`,
    entityType: targetType,
    entityId: target._id,
    metadata: {
      invitationId: invitation._id.toString(),
      status: "pending",
      expiresAt: expiresAt.toISOString(),
      actions: ["accept", "reject"],
    },
  });

  emitUserEvent(recipient._id.toString(), "notification:created", notification);
  try {
    await sendInvitationEmail({
      recipient,
      inviter: actor,
      targetType,
      targetName: target.name,
      invitationId: invitation._id,
      expiresAt,
    });
  } catch (error) {
    console.error("[ProjectHub Email] invitation delivery failed", {
      recipient: recipient.email,
      code: error.code,
      responseCode: error.responseCode,
      message: error.message,
    });
  }

  return invitation.populate([
    { path: "recipient", select: "name email designation" },
    { path: "invitedBy", select: "name email designation" },
  ]);
};

export const getPendingInvitations = async (userId) => {
  await expireInvitations();
  return Invitation.find({
    recipient: userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .populate("invitedBy", "name email designation")
    .sort({ createdAt: -1 });
};

export const respondToInvitation = async (invitationId, userId, decision) => {
  const invitation = await Invitation.findOne({
    _id: invitationId,
    recipient: userId,
    status: "pending",
  });

  if (!invitation) throw new ApiError(404, "Pending invitation not found");
  if (invitation.expiresAt <= new Date()) {
    invitation.status = "expired";
    invitation.respondedAt = new Date();
    await invitation.save();
    throw new ApiError(410, "This invitation has expired");
  }

  if (decision === "accepted") {
    const Model =
      invitation.targetType === "Project" ||
      invitation.targetType === "CollaborationProject"
        ? Project
        : invitation.targetType === "Team"
          ? Team
          : CollaborationBoard;
    const target = await Model.findOne({
      _id: invitation.targetId,
      isActive: true,
    });
    if (!target)
      throw new ApiError(404, `${invitation.targetType} no longer exists`);

    if (invitation.targetType === "Collaboration") {
      const existing = target.participants.find(
        (participant) => participant.user.toString() === userId,
      );
      if (!existing)
        target.participants.push({
          user: userId,
          permission: invitation.role,
          status: "accepted",
          invitedBy: invitation.invitedBy,
          acceptedAt: new Date(),
          joinedAt: new Date(),
        });
    } else if (invitation.targetType === "CollaborationProject") {
      target.collaborators = target.collaborators || [];
      target.collaborators.push({
        user: userId,
        permission: invitation.role,
        status: "accepted",
        invitedBy: invitation.invitedBy,
        acceptedAt: new Date(),
      });
    } else {
      const existing = target.members.find(
        (member) => member.user.toString() === userId,
      );
      if (!existing)
        target.members.push({ user: userId, role: invitation.role });
    }
    if (invitation.targetType === "Team" && invitation.role === "lead") {
      target.lead = userId;
    }
    await target.save();
  }

  invitation.status = decision;
  invitation.respondedAt = new Date();
  await invitation.save();
  await Notification.updateOne(
    { "metadata.invitationId": invitation._id.toString(), recipient: userId },
    { $set: { isRead: true, readAt: new Date() } },
  );
  emitUserEvent(userId, "invitation:updated", invitation);

  await notifySafely(
    {
      title: `Invitation ${decision}`,
      message: `${invitation.targetName} invitation was ${decision} by the invited user.`,
      entityType: invitation.targetType,
      entityId: invitation.targetId,
      metadata: {
        invitationId: invitation._id.toString(),
        status: decision,
      },
      sendEmail: true,
    },
    invitation.invitedBy,
  );

  return invitation;
};

export const expireInvitations = async () => {
  const expired = await Invitation.find({
    status: "pending",
    expiresAt: { $lte: new Date() },
  });
  if (!expired.length) return { expired: 0 };

  await Invitation.updateMany(
    { _id: { $in: expired.map((invitation) => invitation._id) } },
    { $set: { status: "expired", respondedAt: new Date() } },
  );

  for (const invitation of expired) {
    await Notification.create({
      recipient: invitation.recipient,
      type: "in-app",
      title: "Invitation expired",
      message: `Your invitation to join ${invitation.targetName} expired after 24 hours.`,
      entityType: invitation.targetType,
      entityId: invitation.targetId,
      metadata: { invitationId: invitation._id.toString(), status: "expired" },
    });
  }

  return { expired: expired.length };
};
