import Message from "./chat.model.js";
import Project from "../projects/project.model.js";
import Task from "../tasks/task.model.js";
import Team from "../teams/team.model.js";
import User from "../users/users.model.js";
import File from "../files/file.model.js";
import ApiError from "../../utils/ApiError.js";
import { notifySafely } from "../notifications/notification.service.js";
import {
  emitCollaborationEvent,
  emitProjectEvent,
} from "../../realtime/socket.js";
import { deleteStoredFile } from "../files/file.service.js";
import { getAccessibleProject } from "../projects/project-access.service.js";
import { getBoardForUser } from "../collaboration/collaboration.service.js";

const assertScopeAccess = async (scopeType, scopeId, userId) => {
  if (scopeType === "Direct") {
    const recipient = await User.findOne({ _id: scopeId, isActive: true });
    if (!recipient) throw new ApiError(404, "Direct chat recipient not found");
    return recipient;
  }
  if (scopeType === "Task") {
    const task = await Task.findOne({ _id: scopeId, isActive: true }).select(
      "project",
    );
    if (!task) throw new ApiError(404, "Task not found");
    const project = await getAccessibleProject(task.project, userId);
    return { project: project._id };
  }
  if (scopeType === "Project") {
    return getAccessibleProject(scopeId, userId);
  }
  if (scopeType === "CollaborationBoard") {
    const access = await getBoardForUser(scopeId, userId);
    if (!access.canViewBoardContent) {
      throw new ApiError(
        403,
        "Meeting approval is required to use this whiteboard chat.",
      );
    }
    const { board } = access;
    return { project: board.project };
  }
  if (scopeType !== "Team") throw new ApiError(400, "Invalid chat scope type");
  const team = await Team.findOne({ _id: scopeId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");
  const actor = await User.findById(userId).select("role isActive");
  if (
    actor?.role !== "admin" &&
    team.lead.toString() !== userId &&
    !team.members.some((member) => member.user.toString() === userId)
  )
    throw new ApiError(403, "Team chat access required");
  return team;
};

const assertDirectMessageParticipant = (message, userId) => {
  if (
    message.scopeType === "Direct" &&
    message.sender.toString() !== userId &&
    message.scopeId.toString() !== userId
  ) {
    throw new ApiError(403, "Direct chat participant access required");
  }
};

export const listMessages = async (scopeType, scopeId, userId) => {
  await assertScopeAccess(scopeType, scopeId, userId);
  const query = { scopeType, scopeId, isActive: true };
  if (scopeType === "Direct") {
    if (scopeId.toString() === userId.toString())
      throw new ApiError(400, "Choose another user for a direct conversation");
    delete query.scopeId;
    query.$or = [
      { sender: userId, scopeId },
      { sender: scopeId, scopeId: userId },
    ];
  }
  return Message.find(query)
    .populate("sender", "name email designation")
    .populate("attachment", "originalName mimeType size")
    .populate("mentionedUsers", "name email")
    .populate("pinnedBy", "name email")
    .sort({ isPinned: -1, createdAt: 1 })
    .limit(200);
};

export const createMessage = async (
  scopeType,
  scopeId,
  { text, attachmentId, mentionedUserIds = [] },
  userId,
) => {
  if (scopeType === "Direct" && scopeId.toString() === userId.toString())
    throw new ApiError(
      400,
      "You cannot start a direct conversation with yourself",
    );
  const scope = await assertScopeAccess(scopeType, scopeId, userId);
  const projectId = scopeType === "Project" ? scopeId : scope.project;
  const project =
    await Project.findById(projectId).select("owner members team");
  const team = project?.team
    ? await Team.findById(project.team).select("lead members")
    : null;
  const allowedMemberIds = new Set([
    project?.owner?.toString(),
    ...(project?.members || []).map((member) => member.user.toString()),
    team?.lead?.toString(),
    ...(team?.members || []).map((member) => member.user.toString()),
  ]);
  const validMentionIds = mentionedUserIds.filter((id) =>
    allowedMemberIds.has(id),
  );
  const mentionedUsers = await User.find({
    _id: { $in: validMentionIds },
    isActive: true,
  }).select("_id");
  let attachment = null;
  if (attachmentId) {
    attachment = await File.findOne({
      _id: attachmentId,
      targetType: "Project",
      targetId: projectId,
      isActive: true,
    });
    if (!attachment) throw new ApiError(404, "Chat attachment not found");
  }
  const message = await Message.create({
    scopeType,
    scopeId,
    sender: userId,
    text: text.trim(),
    mentionedUsers: mentionedUsers.map((user) => user._id),
    attachment: attachment?._id || null,
  });
  const populated = await message.populate([
    { path: "sender", select: "name email designation" },
    { path: "attachment", select: "originalName mimeType size" },
    { path: "mentionedUsers", select: "name email" },
  ]);
  const roomProjectId = scopeType === "Project" ? scopeId : scope.project;
  if (scopeType === "CollaborationBoard")
    emitCollaborationEvent(scopeId.toString(), "chat:message", populated);
  else if (roomProjectId)
    emitProjectEvent(roomProjectId.toString(), "chat:message", populated);
  if (scopeType === "Project") {
    const projectMemberIds = [
      project?.owner,
      ...(project?.members || []).map((member) => member.user),
      team?.lead,
      ...(team?.members || []).map((member) => member.user),
    ]
      .filter(Boolean)
      .map((id) => id.toString())
      .filter(
        (id, index, ids) =>
          id !== userId.toString() && ids.indexOf(id) === index,
      );
    for (const recipientId of projectMemberIds) {
      await notifySafely(
        {
          title: "New chat message",
          message: `${populated.sender.name}: ${populated.text}`,
          entityType: scopeType === "Task" ? "Task" : "Project",
          entityId: scopeId,
          metadata: {
            projectId,
            messageId: message._id.toString(),
            scopeType,
            scopeId,
            senderName: populated.sender.name,
            text: populated.text,
          },
        },
        recipientId,
      );
    }
  }
  for (const user of mentionedUsers) {
    if (user._id.toString() !== userId)
      await notifySafely(
        {
          title: "You were mentioned in chat",
          message: `${populated.sender.name}: ${populated.text}`,
          entityType: scopeType === "Task" ? "Task" : "Project",
          entityId: message._id,
          metadata: {
            messageId: message._id.toString(),
            scopeType,
            scopeId,
            senderName: populated.sender.name,
            text: populated.text,
          },
        },
        user._id,
      );
  }
  return populated;
};

export const pinMessage = async (messageId, isPinned, userId) => {
  const message = await Message.findOne({ _id: messageId, isActive: true });
  if (!message) throw new ApiError(404, "Message not found");
  await assertScopeAccess(message.scopeType, message.scopeId, userId);
  assertDirectMessageParticipant(message, userId);
  message.isPinned = isPinned;
  message.pinnedAt = isPinned ? new Date() : null;
  message.pinnedBy = isPinned ? userId : null;
  await message.save();
  const populated = await message.populate([
    { path: "sender", select: "name email designation" },
    { path: "attachment", select: "originalName mimeType size" },
    { path: "pinnedBy", select: "name email" },
  ]);
  if (message.scopeType === "CollaborationBoard")
    emitCollaborationEvent(
      message.scopeId.toString(),
      "chat:message",
      populated,
    );
  else if (message.scopeType === "Project")
    emitProjectEvent(message.scopeId.toString(), "chat:message", populated);
  return populated;
};

export const permanentlyDeleteMessage = async (messageId, userId) => {
  const message = await Message.findById(messageId);
  if (!message) throw new ApiError(404, "Message not found");
  await assertScopeAccess(message.scopeType, message.scopeId, userId);
  assertDirectMessageParticipant(message, userId);
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  if (message.sender.toString() !== userId && actor.role !== "admin")
    throw new ApiError(
      403,
      "Only the message author or an administrator can delete it",
    );

  if (message.attachment) {
    await deleteStoredFile(message.attachment);
  }
  await Message.deleteOne({ _id: message._id });

  if (message.scopeType === "CollaborationBoard") {
    emitCollaborationEvent(message.scopeId.toString(), "chat:message-deleted", {
      messageId: message._id,
    });
  } else if (message.scopeType === "Project") {
    emitProjectEvent(message.scopeId.toString(), "chat:message-deleted", {
      messageId: message._id,
    });
  }
  return { deleted: true, messageId: message._id };
};

export const permanentlyClearProjectMessages = async (projectId, userId) => {
  const project = await getAccessibleProject(projectId, userId);
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) throw new ApiError(403, "Active user account required");
  if (actor.role !== "admin" && project.owner.toString() !== userId)
    throw new ApiError(
      403,
      "Only the project owner or an administrator can clear project chat",
    );
  const messages = await Message.find({
    scopeType: "Project",
    scopeId: projectId,
  }).select("attachment");

  for (const message of messages) {
    if (message.attachment) await deleteStoredFile(message.attachment);
  }
  const result = await Message.deleteMany({
    scopeType: "Project",
    scopeId: projectId,
  });
  emitProjectEvent(projectId.toString(), "chat:cleared", { projectId });
  return { deleted: result.deletedCount };
};
