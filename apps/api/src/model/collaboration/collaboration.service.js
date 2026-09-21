import ApiError from "../../utils/ApiError.js";
import Project from "../projects/project.model.js";
import Team from "../teams/team.model.js";
import User from "../users/users.model.js";
import Message from "../chat/chat.model.js";
import { getAccessibleProject } from "../projects/project-access.service.js";
import {
  CollaborationActivity,
  CollaborationBoard,
  CollaborationSession,
} from "./collaboration.model.js";
import { createInvitation } from "../notifications/invitation.service.js";
import Invitation from "../notifications/invitation.model.js";
import { generateCollaborationSummary } from "../../utils/collaboration-summary.service.js";

const boardIdOf = (board) => board._id.toString();

const getBoard = async (boardId) => {
  const board = await CollaborationBoard.findOne({
    _id: boardId,
    isActive: true,
  });
  if (!board) throw new ApiError(404, "Collaboration board not found");
  return board;
};

const canManageBoard = async (board, userId) => {
  const actor = await User.findById(userId).select("role isActive");
  if (!actor?.isActive) return false;
  if (actor.role === "admin" || board.createdBy.toString() === userId)
    return true;
  return board.participants.some(
    (participant) =>
      participant.user.toString() === userId &&
      participant.status === "accepted" &&
      participant.permission === "manager",
  );
};

const isProjectMember = async (project, userId) => {
  if (project.owner.toString() === userId) return true;
  if (
    (project.members || []).some((member) => member.user.toString() === userId)
  ) {
    return true;
  }
  if (!project.team) return false;
  return Boolean(
    await Team.exists({
      _id: project.team,
      isActive: true,
      $or: [{ lead: userId }, { "members.user": userId }],
    }),
  );
};

export const inviteProjectCollaborators = async (
  projectId,
  emails = [],
  permission,
  userId,
  userIds = [],
) => {
  const project = await getAccessibleProject(projectId, userId);
  const team = project.team
    ? await Team.findOne({ _id: project.team, isActive: true }).select(
        "lead members",
      )
    : null;
  const projectMemberIds = new Set(
    [
      project.owner.toString(),
      ...(project.members || []).map((member) => member.user.toString()),
      team?.lead?.toString(),
      ...(team?.members || []).map((member) => member.user.toString()),
    ].filter(Boolean),
  );
  const selectedUsers = await User.find({
    ...(userIds.length
      ? { _id: { $in: userIds } }
      : { email: { $in: emails } }),
    isActive: true,
  }).select("name email");
  const usersByEmail = new Map(
    selectedUsers.map((selectedUser) => [selectedUser.email, selectedUser]),
  );
  const requestedEmails = [
    ...new Set([
      ...emails.map((email) => String(email).trim().toLowerCase()),
      ...selectedUsers.map((selectedUser) => selectedUser.email),
    ]),
  ];
  const pendingInvitations = await Invitation.find({
    targetType: "CollaborationProject",
    targetId: project._id,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).select("recipient role");
  const pendingByUser = new Map(
    pendingInvitations.map((invitation) => [
      invitation.recipient.toString(),
      invitation,
    ]),
  );
  const acceptedByUser = new Map(
    (project.collaborators || [])
      .filter((collaborator) => collaborator.status === "accepted")
      .map((collaborator) => [collaborator.user.toString(), collaborator]),
  );

  return Promise.all(
    requestedEmails.map(async (email) => {
      const recipient = usersByEmail.get(email);
      if (!recipient) return { email, status: "unavailable" };
      if (!projectMemberIds.has(recipient._id.toString())) {
        return { email, status: "not-project-member" };
      }
      if (acceptedByUser.has(recipient._id.toString())) {
        return { email, user: recipient, status: "joined" };
      }
      if (pendingByUser.has(recipient._id.toString())) {
        return { email, user: recipient, status: "invited" };
      }
      try {
        await createInvitation({
          targetType: "CollaborationProject",
          targetId: project._id,
          email,
          role: permission,
          invitedBy: userId,
          targetName: project.name,
        });
        return { email, user: recipient, status: "invited" };
      } catch (error) {
        return { email, status: "error", message: error.message };
      }
    }),
  );
};

export const removeProjectCollaborator = async (
  projectId,
  collaboratorId,
  userId,
) => {
  const project = await getAccessibleProject(projectId, userId);
  const canManage = await isProjectMember(project, userId);
  if (!canManage)
    throw new ApiError(403, "Project collaboration access required");
  if (project.owner.toString() === collaboratorId) {
    throw new ApiError(
      400,
      "Project owner cannot be removed from collaboration",
    );
  }

  const collaborator = project.collaborators?.find(
    (item) => item.user.toString() === collaboratorId,
  );
  if (!collaborator) throw new ApiError(404, "Collaboration member not found");

  collaborator.status = "removed";
  await project.save();
  return project.populate("collaborators.user", "name email avatar");
};

export const listBoards = async (projectId, userId) => {
  await getAccessibleProject(projectId, userId);
  return CollaborationBoard.find({ project: projectId, isActive: true })
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 });
};

export const createBoard = async (projectId, payload, userId) => {
  const project = await getAccessibleProject(projectId, userId);
  const actor = await User.findById(userId).select("role");
  const member = await isProjectMember(project, userId);
  const collaborator = project.collaborators?.find(
    (item) => item.user.toString() === userId && item.status === "accepted",
  );
  const canCreate =
    member || actor?.role === "admin" || collaborator?.permission === "manager";
  if (!canCreate)
    throw new ApiError(403, "Only project managers can create whiteboards");
  const board = await CollaborationBoard.create({
    project: projectId,
    name: payload.name.trim(),
    description: payload.description || "",
    createdBy: userId,
    participants: [
      {
        user: userId,
        permission: "manager",
        status: "accepted",
        invitedBy: userId,
        joinedAt: new Date(),
        acceptedAt: new Date(),
      },
    ],
  });
  await CollaborationActivity.create({
    board: board._id,
    project: projectId,
    actor: userId,
    type: "board.created",
    payload: { name: board.name },
  });
  return board.populate("createdBy", "name email");
};

export const getBoardForUser = async (boardId, userId) => {
  const board = await getBoard(boardId);
  const project = await getAccessibleProject(board.project, userId);
  const participant = board.participants.find(
    (item) => item.user.toString() === userId && item.status === "accepted",
  );
  const collaborator = project.collaborators?.find(
    (item) => item.user.toString() === userId && item.status === "accepted",
  );
  const member = await isProjectMember(project, userId);
  const actor = await User.findById(userId).select("role");
  if (
    actor?.role !== "admin" &&
    !participant &&
    !collaborator &&
    !member &&
    board.createdBy.toString() !== userId
  )
    throw new ApiError(403, "Collaboration access required");
  return {
    board,
    participant,
    isManager:
      member ||
      actor?.role === "admin" ||
      board.createdBy.toString() === userId ||
      participant?.permission === "manager" ||
      collaborator?.permission === "manager",
    isEditor:
      member ||
      actor?.role === "admin" ||
      board.createdBy.toString() === userId ||
      ["manager", "editor"].includes(
        participant?.permission || collaborator?.permission,
      ),
  };
};

export const inviteBoardParticipants = async (
  boardId,
  emails,
  permission,
  userId,
) => {
  const { board, isManager } = await getBoardForUser(boardId, userId);
  if (!isManager)
    throw new ApiError(403, "Only board managers can invite collaborators");
  const project = await Project.findById(board.project).select("name");
  const invitations = [];
  for (const email of [...new Set(emails)]) {
    const invitation = await createInvitation({
      targetType: "Collaboration",
      targetId: board._id,
      email,
      role: permission,
      invitedBy: userId,
      targetName: `${project.name} / ${board.name}`,
    });
    invitations.push(invitation);
  }
  return invitations;
};

export const updateBoardSnapshot = async (boardId, snapshot, userId) => {
  const { board, isEditor } = await getBoardForUser(boardId, userId);
  if (!isEditor)
    throw new ApiError(403, "Board is read-only for this participant");
  board.snapshot = snapshot;
  board.snapshotVersion += 1;
  await board.save();
  return { version: board.snapshotVersion };
};

export const listBoardHistory = async (boardId, userId) => {
  const { board } = await getBoardForUser(boardId, userId);
  return CollaborationActivity.find({ board: board._id })
    .populate("actor", "name email")
    .sort({ createdAt: -1 })
    .limit(300);
};

export const getBoardSessions = async (boardId, userId) => {
  const { board } = await getBoardForUser(boardId, userId);
  return CollaborationSession.find({ board: board._id })
    .populate("participants", "name email")
    .sort({ startedAt: -1 });
};

export const getSessionDetails = async (sessionId, userId) => {
  const session = await CollaborationSession.findById(sessionId).populate(
    "participants",
    "name email avatar",
  );
  if (!session) throw new ApiError(404, "Collaboration session not found");
  await getBoardForUser(session.board, userId);
  const messages = await Message.find({
    _id: { $in: session.chatMessageIds || [] },
    isActive: true,
  })
    .populate("sender", "name email avatar")
    .sort({ createdAt: 1 });
  return { session, messages };
};

export const startBoardSession = async (boardId, userId, payload = {}) => {
  const { board } = await getBoardForUser(boardId, userId);
  if (payload.sourceSessionId) {
    const source = await CollaborationSession.findOne({
      _id: payload.sourceSessionId,
      board: board._id,
    });
    if (!source)
      throw new ApiError(404, "Source collaboration session not found");
    if (source.snapshot) {
      board.snapshot = source.snapshot;
      board.snapshotVersion += 1;
      await board.save();
    }
  }
  const activeSession = await CollaborationSession.findOne({
    board: board._id,
    endedAt: null,
  });
  if (activeSession) {
    if (!activeSession.participants.some((id) => id.toString() === userId)) {
      activeSession.participants.push(userId);
      await activeSession.save();
    }
    return activeSession;
  }
  const session = await CollaborationSession.create({
    board: board._id,
    project: board.project,
    startedAt: new Date(),
    title: payload.title?.trim() || "Collaboration session",
    participants: [userId],
  });
  await CollaborationActivity.create({
    board: board._id,
    project: board.project,
    actor: userId,
    type: "session.started",
    payload: { sessionId: session._id },
  });
  return session;
};

export const continueBoardSession = async (sessionId, userId, payload = {}) => {
  const source = await CollaborationSession.findById(sessionId);
  if (!source) throw new ApiError(404, "Collaboration session not found");
  await getBoardForUser(source.board, userId);
  return startBoardSession(source.board, userId, {
    title: payload.title || `Continuation of ${source.title}`,
    sourceSessionId: source._id,
  });
};

export const endBoardSession = async (sessionId, userId) => {
  const session = await CollaborationSession.findById(sessionId);
  if (!session) throw new ApiError(404, "Collaboration session not found");
  const { board, isManager } = await getBoardForUser(session.board, userId);
  if (!isManager)
    throw new ApiError(
      403,
      "Only board managers can end a collaboration session",
    );
  if (session.endedAt) return session;

  const endedAt = new Date();
  const [messages, activityCount] = await Promise.all([
    Message.find({
      scopeType: "CollaborationBoard",
      scopeId: board._id,
      isActive: true,
      createdAt: { $gte: session.startedAt, $lte: endedAt },
    })
      .populate("sender", "name")
      .select("_id text sender"),
    CollaborationActivity.countDocuments({
      board: board._id,
      createdAt: { $gte: session.startedAt },
    }),
  ]);
  session.endedAt = endedAt;
  session.durationSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
  );
  session.snapshot = board.snapshot;
  session.chatMessageIds = messages.map((message) => message._id);
  session.messageCount = messages.length;
  session.activityCount = activityCount;
  const generatedSummary = await generateCollaborationSummary({
    title: session.title,
    participantsCount: session.participants.length,
    activityCount,
    messages,
  });
  session.summary = generatedSummary.summary;
  session.summaryType = generatedSummary.summaryType;
  await session.save();
  await CollaborationActivity.create({
    board: board._id,
    project: board.project,
    actor: userId,
    type: "session.ended",
    payload: {
      sessionId: session._id,
      messageCount: messages.length,
      activityCount,
      summaryType: generatedSummary.summaryType,
    },
  });
  return session;
};

export const leaveBoardSession = async (sessionId, userId) => {
  const session = await CollaborationSession.findOne({
    _id: sessionId,
    endedAt: null,
  });
  if (!session)
    throw new ApiError(404, "Active collaboration session not found");
  await getBoardForUser(session.board, userId);
  session.participants = session.participants.filter(
    (participant) => participant.toString() !== userId,
  );
  await session.save();
  return session;
};

export const getBoardSnapshot = async (boardId, userId) => {
  const { board } = await getBoardForUser(boardId, userId);
  return { snapshot: board.snapshot, version: board.snapshotVersion };
};

export const deleteBoard = async (boardId, userId) => {
  const { board, isManager } = await getBoardForUser(boardId, userId);
  if (!isManager)
    throw new ApiError(403, "Only board managers can delete a board");
  board.isActive = false;
  await board.save();
  await CollaborationSession.updateMany(
    { board: board._id, endedAt: null },
    { $set: { endedAt: new Date() } },
  );
  return { deleted: true, boardId: board._id };
};

export const clearBoardSessions = async (boardId, userId) => {
  const { board, isManager } = await getBoardForUser(boardId, userId);
  if (!isManager)
    throw new ApiError(403, "Only board managers can clear session history");
  await CollaborationSession.deleteMany({ board: board._id });
  return { cleared: true };
};

export const getBoardById = getBoardForUser;
export const getBoardIdentifier = boardIdOf;
