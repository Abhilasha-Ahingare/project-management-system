import ApiError from "../../utils/ApiError.js";
import Project from "../projects/project.model.js";
import User from "../users/users.model.js";
import Message from "../chat/chat.model.js";
import { getAccessibleProject } from "../projects/project-access.service.js";
import {
  CollaborationActivity,
  CollaborationBoard,
  CollaborationSession,
} from "./collaboration.model.js";
import { createInvitation } from "../notifications/invitation.service.js";

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

export const inviteProjectCollaborators = async (
  projectId,
  emails = [],
  permission,
  userId,
  userIds = [],
) => {
  const project = await getAccessibleProject(projectId, userId);
  const selectedUsers = userIds.length
    ? await User.find({ _id: { $in: userIds }, isActive: true }).select("email")
    : [];
  const invitationEmails = [
    ...new Set([
      ...emails,
      ...selectedUsers.map((selectedUser) => selectedUser.email),
    ]),
  ];
  return Promise.all(
    invitationEmails.map((email) =>
      createInvitation({
        targetType: "CollaborationProject",
        targetId: project._id,
        email,
        role: permission,
        invitedBy: userId,
        targetName: project.name,
      }),
    ),
  );
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
  const collaborator = project.collaborators?.find(
    (item) => item.user.toString() === userId && item.status === "accepted",
  );
  const canCreate =
    actor?.role === "admin" ||
    project.owner.toString() === userId ||
    collaborator?.permission === "manager";
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
  const actor = await User.findById(userId).select("role");
  if (
    actor?.role !== "admin" &&
    !participant &&
    !collaborator &&
    board.createdBy.toString() !== userId
  )
    throw new ApiError(403, "Collaboration access required");
  return {
    board,
    participant,
    isManager:
      actor?.role === "admin" ||
      board.createdBy.toString() === userId ||
      participant?.permission === "manager" ||
      collaborator?.permission === "manager",
    isEditor:
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

export const startBoardSession = async (boardId, userId) => {
  const { board } = await getBoardForUser(boardId, userId);
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

  const [messageCount, activityCount] = await Promise.all([
    Message.countDocuments({
      scopeType: "CollaborationBoard",
      scopeId: board._id,
      isActive: true,
      createdAt: { $gte: session.startedAt },
    }),
    CollaborationActivity.countDocuments({
      board: board._id,
      createdAt: { $gte: session.startedAt },
    }),
  ]);
  session.endedAt = new Date();
  session.messageCount = messageCount;
  session.activityCount = activityCount;
  session.summary = `${session.participants.length} participant(s), ${activityCount} recorded board activities, and ${messageCount} chat message(s).`;
  await session.save();
  await CollaborationActivity.create({
    board: board._id,
    project: board.project,
    actor: userId,
    type: "session.ended",
    payload: { sessionId: session._id, messageCount, activityCount },
  });
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
