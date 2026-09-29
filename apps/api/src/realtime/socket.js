import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import env from "../config/env.js";
import Project from "../model/projects/project.model.js";
import Team from "../model/teams/team.model.js";
import Task from "../model/tasks/task.model.js";
import User from "../model/users/users.model.js";
import {
  CollaborationActivity,
  CollaborationBoard,
} from "../model/collaboration/collaboration.model.js";
import { getBoardForUser } from "../model/collaboration/collaboration.service.js";

let io;

const projectRoom = (projectId) => `project:${projectId}`;
const taskRoom = (taskId) => `task:${taskId}`;
const collaborationRoom = (boardId) => `collaboration-board:${boardId}`;
const userRoom = (userId) => `user:${userId}`;

const hasProjectAccess = async (project, userId) => {
  if (!project) return false;
  if (
    project.owner.toString() === userId ||
    project.members.some(
      (member) => (member.user || member).toString() === userId,
    )
  )
    return true;
  if (!project.team) return false;
  return Boolean(
    await Team.exists({
      _id: project.team,
      isActive: true,
      $or: [{ lead: userId }, { "members.user": userId }],
    }),
  );
};

export const initializeRealtime = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace("Bearer ", "");
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, env.jwtSecret);
      socket.user = { id: decoded.userId };
      next();
    } catch (error) {
      next(
        new Error(
          error.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid token",
        ),
      );
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.user.id));

    socket.on("join_project", async (projectId, acknowledge) => {
      const project = await Project.findOne({
        _id: projectId,
        isActive: true,
      }).select("owner members team");
      if (!(await hasProjectAccess(project, socket.user.id))) {
        return acknowledge?.({
          success: false,
          message: "Access denied to project",
        });
      }

      socket.join(projectRoom(projectId));
      acknowledge?.({ success: true, room: projectRoom(projectId) });
    });

    socket.on("join_task", async (taskId, acknowledge) => {
      const task = await Task.findOne({ _id: taskId, isActive: true }).select(
        "project",
      );
      const project = task
        ? await Project.findOne({ _id: task.project, isActive: true }).select(
            "owner members team",
          )
        : null;
      if (!(await hasProjectAccess(project, socket.user.id))) {
        return acknowledge?.({
          success: false,
          message: "Access denied to task",
        });
      }

      socket.join(taskRoom(taskId));
      acknowledge?.({ success: true, room: taskRoom(taskId) });
    });

    socket.on("leave_project", (projectId) =>
      socket.leave(projectRoom(projectId)),
    );
    socket.on("leave_task", (taskId) => socket.leave(taskRoom(taskId)));

    socket.on("join_collaboration_board", async (boardId, acknowledge) => {
      try {
        await getBoardForUser(boardId, socket.user.id);
        socket.join(collaborationRoom(boardId));
        const participant = await User.findById(socket.user.id).select(
          "_id name avatar",
        );
        socket
          .to(collaborationRoom(boardId))
          .emit("collaboration_participant_joined", participant);
        const sockets = await io.in(collaborationRoom(boardId)).fetchSockets();
        const ids = sockets.map((roomSocket) => roomSocket.user.id);
        const participants = await User.find({ _id: { $in: ids } }).select(
          "_id name avatar",
        );
        socket.emit("collaboration_participants", participants);
        acknowledge?.({ success: true, room: collaborationRoom(boardId) });
      } catch (error) {
        acknowledge?.({ success: false, message: error.message });
      }
    });

    socket.on("leave_collaboration_board", (boardId) =>
      (() => {
        socket
          .to(collaborationRoom(boardId))
          .emit("collaboration_participant_left", { userId: socket.user.id });
        socket.leave(collaborationRoom(boardId));
      })(),
    );

    socket.on("collaboration_board_update", async (payload, acknowledge) => {
      try {
        const boardId = payload?.boardId;
        const snapshot = payload?.snapshot;
        const { board, isEditor } = await getBoardForUser(
          boardId,
          socket.user.id,
        );
        if (!isEditor)
          throw new Error("Board is read-only for this participant");
        if (!snapshot || typeof snapshot !== "object")
          throw new Error("Invalid collaboration snapshot");
        const updated = await CollaborationBoard.findOneAndUpdate(
          { _id: board._id, isActive: true },
          {
            $set: { snapshot, updatedAt: new Date() },
            $inc: { snapshotVersion: 1 },
          },
          { returnDocument: "after", select: "snapshotVersion" },
        );
        const update = {
          boardId: board._id.toString(),
          snapshot,
          version: updated.snapshotVersion,
          updatedBy: socket.user.id,
        };
        void CollaborationActivity.create({
          board: board._id,
          project: board.project,
          actor: socket.user.id,
          type: "board.changed",
          payload: { version: updated.snapshotVersion },
        });
        socket
          .to(collaborationRoom(boardId))
          .emit("collaboration_board_updated", update);
        acknowledge?.({ success: true, version: updated.snapshotVersion });
      } catch (error) {
        acknowledge?.({ success: false, message: error.message });
      }
    });
  });

  return io;
};

const emit = (room, event, payload) => {
  if (io) io.to(room).emit(event, payload);
};

export const emitProjectEvent = (projectId, event, payload) =>
  emit(projectRoom(projectId), event, payload);
export const emitTaskEvent = (taskId, event, payload) =>
  emit(taskRoom(taskId), event, payload);
export const emitUserEvent = (userId, event, payload) =>
  emit(userRoom(userId), event, payload);
