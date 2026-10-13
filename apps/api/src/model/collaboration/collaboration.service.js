import ApiError from "../../utils/ApiError.js";
import Project from "../projects/project.model.js";
import Team from "../teams/team.model.js";
import User from "../users/users.model.js";
import Message from "../chat/chat.model.js";
import { getAccessibleProject } from "../projects/project-access.service.js";
import {
  CollaborationActivity,
  CollaborationBoard,
  CollaborationJoinRequest,
  CollaborationSession,
} from "./collaboration.model.js";
import { createInvitation } from "../notifications/invitation.service.js";
import Invitation from "../notifications/invitation.model.js";
import Notification from "../notifications/notification.model.js";
import {
  emitCollaborationEvent,
  emitUserEvent,
} from "../../realtime/socket.js";
import {
  askCollaborationAI,
  generateCollaborationSummary,
} from "../../utils/collaboration-summary.service.js";

const boardIdOf = (board) => board._id.toString();
const sessionCreatorId = (session) =>
  (session.createdBy || session.participants[0])?.toString();

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
  const boards = await CollaborationBoard.find({
    project: projectId,
    isActive: true,
  })
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 });
  if (!boards.length) return boards;

  const activeSessions = await CollaborationSession.find({
    board: { $in: boards.map((board) => board._id) },
    endedAt: null,
  }).populate("participants", "name avatar");
  const sessionsByBoard = new Map(
    activeSessions.map((session) => [session.board.toString(), session]),
  );

  return boards.map((board) => ({
    ...board.toObject(),
    activeSession: sessionsByBoard.get(board._id.toString()) || null,
  }));
};

export const createBoard = async (projectId, payload, userId) => {
  const project = await getAccessibleProject(projectId, userId);
  const actor = await User.findById(userId).select("role");
  const member = await isProjectMember(project, userId);
  const collaborator = project.collaborators?.find(
    (item) => item.user.toString() === userId && item.status === "accepted",
  );
  const canCreate = member || actor?.role === "admin" || Boolean(collaborator);
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
  const activeSession = await CollaborationSession.findOne({
    board: board._id,
    endedAt: null,
  }).select("_id createdBy participants startedAt");
  if (
    actor?.role !== "admin" &&
    !participant &&
    !collaborator &&
    !member &&
    board.createdBy.toString() !== userId
  )
    throw new ApiError(403, "Collaboration access required");
  const isManager =
    actor?.role === "admin" ||
    board.createdBy.toString() === userId ||
    participant?.permission === "manager";
  const populatedBoard = await board.populate([
    { path: "createdBy", select: "name email avatar" },
    { path: "participants.user", select: "name email avatar" },
  ]);
  
  const pendingInvitations = await Invitation.find({
    targetType: "Collaboration",
    targetId: board._id,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).populate("recipient", "name email avatar");
  const projectMemberAccess = member || Boolean(collaborator);
  const canViewBoardContent =
    isManager ||
    participant?.status === "accepted" ||
    (!activeSession && projectMemberAccess);
  const myJoinRequest =
    activeSession && !participant
      ? await CollaborationJoinRequest.findOne({
          session: activeSession._id,
          requester: userId,
          status: "pending",
        }).select("_id status createdAt")
      : null;
  const boardResult = populatedBoard.toObject();
  if (!canViewBoardContent) boardResult.snapshot = null;
  return {
    board: boardResult,
    participant,
    activeSession,
    canViewBoardContent,
    projectMemberAccess,
    myJoinRequest,
    canRequestJoin: Boolean(
      activeSession && (member || collaborator) && !participant,
    ),
    pendingInvitations,
    isManager,
    isEditor:
      isManager ||
      (participant?.status === "accepted" &&
        ["manager", "editor"].includes(participant.permission)) ||
      (!activeSession && projectMemberAccess),
  };
};

export const inviteBoardParticipants = async (
  boardId,
  emails = [],
  permission,
  userId,
  userIds = [],
) => {
  const { board, isManager } = await getBoardForUser(boardId, userId);
  if (!isManager)
    throw new ApiError(403, "Only board managers can invite collaborators");
  if (await CollaborationSession.exists({ board: board._id, endedAt: null })) {
    throw new ApiError(
      409,
      "Invitations close when the meeting starts. Ask the person to request to join instead.",
    );
  }
  const project = await Project.findById(board.project).select("name");
  const selectedUsers = await User.find({
    ...(userIds.length
      ? { _id: { $in: userIds } }
      : { email: { $in: emails.map((email) => email.toLowerCase()) } }),
    isActive: true,
  }).select("email");
  const invitations = [];
  for (const email of [
    ...new Set(selectedUsers.map((selectedUser) => selectedUser.email)),
  ]) {
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
  const { board, participant, isManager, activeSession, projectMemberAccess } =
    await getBoardForUser(boardId, userId);
  if (!participant && !isManager && (activeSession || !projectMemberAccess))
    throw new ApiError(403, "Meeting approval is required to view history.");
  return CollaborationActivity.find({ board: board._id })
    .populate("actor", "name email")
    .sort({ createdAt: -1 })
    .limit(300);
};

export const askBoardAI = async (boardId, question, userId) => {
  const { board, participant, isManager, activeSession, projectMemberAccess } =
    await getBoardForUser(boardId, userId);
  if (!participant && !isManager && (activeSession || !projectMemberAccess))
    throw new ApiError(403, "Meeting approval is required to ask board AI.");
  const [messages, activities] = await Promise.all([
    Message.find({
      scopeType: "CollaborationBoard",
      scopeId: board._id,
      isActive: true,
    })
      .populate("sender", "name")
      .sort({ createdAt: 1 })
      .limit(200),
    CollaborationActivity.find({ board: board._id })
      .populate("actor", "name")
      .sort({ createdAt: 1 })
      .limit(200),
  ]);
  try {
    return await askCollaborationAI({
      question,
      boardName: board.name,
      messages,
      activities,
    });
  } catch (error) {
    console.error("[ProjectHub AI] board assistant request failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    const message =
      error.status === 401
        ? "OpenAI rejected the configured API key. Check OPENAI_API_KEY in apps/api/src/.env and restart the API."
        : error.status === 429
          ? "OpenAI rate limit or account quota reached. Check the OpenAI billing and usage limits."
          : error.status === 403
            ? "The configured OpenAI account cannot access this model. Check OPENAI_MODEL and model access."
            : "OpenAI could not answer this request. Check the API server logs for details.";
    throw new ApiError(502, message);
  }
};

export const getBoardSessions = async (boardId, userId) => {
  const { board, participant, isManager, activeSession, projectMemberAccess } =
    await getBoardForUser(boardId, userId);
  if (!participant && !isManager && activeSession) {
    return CollaborationSession.find({ board: board._id, endedAt: null })
      .select("board project startedAt endedAt title participants")
      .populate("participants", "name avatar")
      .sort({ startedAt: -1 });
  }
  if (!participant && !isManager && !projectMemberAccess)
    throw new ApiError(403, "Project membership is required to view sessions.");
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
  const access = await getBoardForUser(session.board, userId);
  if (
    !access.participant &&
    !access.isManager &&
    (access.activeSession || !access.projectMemberAccess || !session.endedAt)
  )
    throw new ApiError(
      403,
      "Meeting approval is required to view this session.",
    );
  const messages = await Message.find({
    _id: { $in: session.chatMessageIds || [] },
    isActive: true,
  })
    .populate("sender", "name email avatar")
    .sort({ createdAt: 1 });
  return { session, messages };
};

export const startBoardSession = async (boardId, userId, payload = {}) => {
  const { board, participant, isManager } = await getBoardForUser(
    boardId,
    userId,
  );
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
    if (!participant && !isManager) {
      throw new ApiError(
        403,
        "Request approval is required to join this active meeting.",
      );
    }
    if (!activeSession.participants.some((id) => id.toString() === userId)) {
      activeSession.participants.push(userId);
      await activeSession.save();
      emitCollaborationEvent(board._id, "collaboration_session_updated", {
        sessionId: activeSession._id,
        type: "participant-joined",
      });
    }
    return activeSession;
  }
  if (!participant && !isManager) {
    throw new ApiError(
      403,
      "Only an invited or approved collaborator can start this meeting.",
    );
  }
  const session = await CollaborationSession.create({
    board: board._id,
    project: board.project,
    createdBy: userId,
    startedAt: new Date(),
    title: payload.title?.trim() || "Collaboration session",
    participants: [userId],
  });
  await expirePendingBoardInvitations(board._id);
  await CollaborationActivity.create({
    board: board._id,
    project: board.project,
    actor: userId,
    type: "session.started",
    payload: { sessionId: session._id },
  });
  return session;
};

const expirePendingBoardInvitations = async (boardId) => {
  const pending = await Invitation.find({
    targetType: "Collaboration",
    targetId: boardId,
    status: "pending",
  });
  if (!pending.length) return;
  const now = new Date();
  await Invitation.updateMany(
    { _id: { $in: pending.map((invitation) => invitation._id) } },
    { $set: { status: "expired", respondedAt: now } },
  );
  await Notification.updateMany(
    {
      "metadata.invitationId": {
        $in: pending.map((invitation) => invitation._id.toString()),
      },
    },
    {
      $set: {
        isActive: false,
        isRead: true,
        readAt: now,
        "metadata.status": "expired",
      },
    },
  );
  for (const invitation of pending) {
    emitUserEvent(invitation.recipient.toString(), "invitation:updated", {
      _id: invitation._id,
      targetType: invitation.targetType,
      targetId: invitation.targetId,
      status: "expired",
    });
  }
};

export const requestToJoinBoardSession = async (boardId, userId) => {
  const { board, participant, activeSession, canRequestJoin } =
    await getBoardForUser(boardId, userId);
  if (!activeSession)
    throw new ApiError(409, "There is no active meeting to request to join.");
  if (participant?.status === "accepted")
    throw new ApiError(409, "You already have access to this whiteboard.");
  if (!canRequestJoin)
    throw new ApiError(403, "Only project team members can request to join.");

  const existing = await CollaborationJoinRequest.findOne({
    session: activeSession._id,
    requester: userId,
    status: "pending",
  }).populate("requester", "name email avatar");
  if (existing) return existing;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const requestCount = await CollaborationJoinRequest.countDocuments({
    session: activeSession._id,
    requester: userId,
    createdAt: { $gte: oneHourAgo },
  });
  if (requestCount >= 5) {
    throw new ApiError(
      429,
      "You have reached the limit of 5 join requests for this meeting per hour.",
    );
  }

  const request = await CollaborationJoinRequest.create({
    board: board._id,
    session: activeSession._id,
    project: board.project,
    requester: userId,
  });
  const populated = await request.populate("requester", "name email avatar");
  emitUserEvent(
    sessionCreatorId(activeSession),
    "collaboration_join_request_created",
    {
      request: populated,
      boardId: board._id,
      projectId: board.project,
    },
  );
  return populated;
};

export const listPendingBoardJoinRequests = async (boardId, userId) => {
  const { board, activeSession } = await getBoardForUser(boardId, userId);
  if (!activeSession) return [];
  if (sessionCreatorId(activeSession) !== userId)
    throw new ApiError(403, "Only the meeting creator can view join requests.");
  return CollaborationJoinRequest.find({
    board: board._id,
    session: activeSession._id,
    status: "pending",
  })
    .populate("requester", "name email avatar")
    .sort({ createdAt: 1 });
};

export const respondToBoardJoinRequest = async (
  requestId,
  userId,
  decision,
) => {
  const request = await CollaborationJoinRequest.findOne({
    _id: requestId,
    status: "pending",
  });
  if (!request) throw new ApiError(404, "Pending join request not found.");
  const { board, activeSession } = await getBoardForUser(request.board, userId);
  if (
    !activeSession ||
    activeSession._id.toString() !== request.session.toString()
  )
    throw new ApiError(410, "This meeting has ended; the request expired.");
  if (sessionCreatorId(activeSession) !== userId)
    throw new ApiError(
      403,
      "Only the meeting creator can respond to join requests.",
    );
  if (request.requester.toString() === userId)
    throw new ApiError(403, "You cannot respond to your own join request.");

  request.status = decision;
  request.respondedBy = userId;
  request.respondedAt = new Date();
  await request.save();

  if (decision === "approved") {
    const boardParticipant = board.participants.find(
      (item) => item.user.toString() === request.requester.toString(),
    );
    if (boardParticipant) {
      boardParticipant.permission = "editor";
      boardParticipant.status = "accepted";
      boardParticipant.invitedBy = userId;
      boardParticipant.acceptedAt = new Date();
      boardParticipant.joinedAt = new Date();
    } else {
      board.participants.push({
        user: request.requester,
        permission: "editor",
        status: "accepted",
        invitedBy: userId,
        acceptedAt: new Date(),
        joinedAt: new Date(),
      });
    }
    if (
      !activeSession.participants.some(
        (participant) =>
          participant.toString() === request.requester.toString(),
      )
    ) {
      activeSession.participants.push(request.requester);
    }
    await Promise.all([board.save(), activeSession.save()]);
    await CollaborationActivity.create({
      board: board._id,
      project: board.project,
      actor: userId,
      type: "participant.joined",
      payload: {
        userId: request.requester.toString(),
        source: "approved-request",
      },
    });
  }

  const populated = await request.populate([
    { path: "requester", select: "name email avatar" },
    { path: "respondedBy", select: "name avatar" },
  ]);
  emitCollaborationEvent(board._id, "collaboration_join_request_updated", {
    request: populated,
  });
  emitCollaborationEvent(board._id, "collaboration_session_updated", {
    sessionId: activeSession._id,
    type: decision === "approved" ? "participant-joined" : "request-rejected",
  });
  emitUserEvent(
    request.requester.toString(),
    "collaboration_join_request_updated",
    {
      requestId: request._id,
      status: decision,
      boardId: board._id,
      projectId: board.project,
    },
  );
  return populated;
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
  const [messages, activities] = await Promise.all([
    Message.find({
      scopeType: "CollaborationBoard",
      scopeId: board._id,
      isActive: true,
      createdAt: { $gte: session.startedAt, $lte: endedAt },
    })
      .populate("sender", "name")
      .populate("attachment", "originalName")
      .select("_id text sender attachment"),
    CollaborationActivity.find({
      board: board._id,
      createdAt: { $gte: session.startedAt, $lte: endedAt },
    })
      .populate("actor", "name")
      .select("actor type payload createdAt")
      .sort({ createdAt: 1 })
      .limit(500),
  ]);
  const activityCount = activities.length;
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
    activities,
    snapshot: board.snapshot,
  });
  session.summary = generatedSummary.summary;
  session.summaryType = generatedSummary.summaryType;
  await session.save();
  const pendingJoinRequests = await CollaborationJoinRequest.find({
    session: session._id,
    status: "pending",
  });
  if (pendingJoinRequests.length) {
    await CollaborationJoinRequest.updateMany(
      { _id: { $in: pendingJoinRequests.map((request) => request._id) } },
      { $set: { status: "expired", respondedAt: endedAt } },
    );
    for (const request of pendingJoinRequests) {
      emitUserEvent(
        request.requester.toString(),
        "collaboration_join_request_updated",
        {
          requestId: request._id,
          status: "expired",
          boardId: board._id,
          projectId: board.project,
        },
      );
    }
  }
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
  const { board, canViewBoardContent } = await getBoardForUser(boardId, userId);
  if (!canViewBoardContent)
    throw new ApiError(403, "Meeting approval is required to view the board.");
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
