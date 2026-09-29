import express from "express";
import Joi from "joi";
import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createBoard,
  getBoardForUser,
  listBoards,
  createBoard as createBoardService,
  inviteBoardParticipants,
  updateBoardSnapshot,
  listBoardHistory,
  getBoardSessions,
  startBoardSession,
  endBoardSession,
  getBoardSnapshot,
  inviteProjectCollaborators,
  removeProjectCollaborator,
  deleteBoard,
  clearBoardSessions,
  continueBoardSession,
  getSessionDetails,
  leaveBoardSession,
  askBoardAI,
} from "./collaboration.service.js";

const router = express.Router();
const boardSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(1000).allow("").default(""),
});
const inviteSchema = Joi.object({
  emails: Joi.array().items(Joi.string().email()).max(50),
  userIds: Joi.array().items(Joi.string().hex().length(24)).max(50),
  permission: Joi.string()
    .valid("viewer", "editor", "manager")
    .default("editor"),
}).custom((value, helpers) => {
  if (!(value.emails?.length || value.userIds?.length)) {
    return helpers.error("any.custom");
  }
  return value;
}, "at least one collaborator");
const snapshotSchema = Joi.object({ snapshot: Joi.object().required() });
const sessionSchema = Joi.object({
  title: Joi.string()
    .trim()
    .max(160)
    .allow("")
    .default("Collaboration session"),
  sourceSessionId: Joi.string().hex().length(24).allow(null),
});

router.use(authMiddleware);
router.get(
  "/projects/:projectId/collaboration/boards",
  asyncHandler(async (req, res) => {
    const boards = await listBoards(req.params.projectId, req.user.id);
    res.json(
      new ApiResponse(200, boards, "Collaboration boards fetched successfully"),
    );
  }),
);
router.post(
  "/projects/:projectId/collaboration/boards",
  validate(boardSchema),
  asyncHandler(async (req, res) => {
    const board = await createBoardService(
      req.params.projectId,
      req.body,
      req.user.id,
    );
    res
      .status(201)
      .json(
        new ApiResponse(201, board, "Collaboration board created successfully"),
      );
  }),
);
router.post(
  "/projects/:projectId/collaboration/invitations",
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const invitations = await inviteProjectCollaborators(
      req.params.projectId,
      req.body.emails || [],
      req.body.permission,
      req.user.id,
      req.body.userIds || [],
    );
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          invitations,
          "Collaboration invitations sent successfully",
        ),
      );
  }),
);
router.delete(
  "/projects/:projectId/collaboration/members/:userId",
  asyncHandler(async (req, res) => {
    const project = await removeProjectCollaborator(
      req.params.projectId,
      req.params.userId,
      req.user.id,
    );
    res.json(
      new ApiResponse(
        200,
        project,
        "Collaboration member removed successfully",
      ),
    );
  }),
);
router.get(
  "/collaboration/boards/:boardId",
  asyncHandler(async (req, res) => {
    const result = await getBoardForUser(req.params.boardId, req.user.id);
    res.json(
      new ApiResponse(200, result, "Collaboration board fetched successfully"),
    );
  }),
);
router.delete(
  "/collaboration/boards/:boardId",
  asyncHandler(async (req, res) => {
    const result = await deleteBoard(req.params.boardId, req.user.id);
    res.json(
      new ApiResponse(200, result, "Collaboration board deleted successfully"),
    );
  }),
);
router.post(
  "/collaboration/boards/:boardId/invitations",
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const invitations = await inviteBoardParticipants(
      req.params.boardId,
      req.body.emails,
      req.body.permission,
      req.user.id,
    );
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          invitations,
          "Collaboration invitations sent successfully",
        ),
      );
  }),
);
router.get(
  "/collaboration/boards/:boardId/snapshot",
  asyncHandler(async (req, res) => {
    const snapshot = await getBoardSnapshot(req.params.boardId, req.user.id);
    res.json(
      new ApiResponse(
        200,
        snapshot,
        "Collaboration snapshot fetched successfully",
      ),
    );
  }),
);
router.post(
  "/collaboration/boards/:boardId/snapshot",
  validate(snapshotSchema),
  asyncHandler(async (req, res) => {
    const result = await updateBoardSnapshot(
      req.params.boardId,
      req.body.snapshot,
      req.user.id,
    );
    res.json(
      new ApiResponse(200, result, "Collaboration snapshot saved successfully"),
    );
  }),
);
router.get(
  "/collaboration/boards/:boardId/history",
  asyncHandler(async (req, res) => {
    const history = await listBoardHistory(req.params.boardId, req.user.id);
    res.json(
      new ApiResponse(
        200,
        history,
        "Collaboration history fetched successfully",
      ),
    );
  }),
);
router.post(
  "/collaboration/boards/:boardId/ai",
  validate(
    Joi.object({ question: Joi.string().trim().min(2).max(2000).required() }),
  ),
  asyncHandler(async (req, res) => {
    const answer = await askBoardAI(
      req.params.boardId,
      req.body.question,
      req.user.id,
    );
    res.json(
      new ApiResponse(200, { answer }, "Collaboration AI response generated"),
    );
  }),
);
router.get(
  "/collaboration/boards/:boardId/sessions",
  asyncHandler(async (req, res) => {
    const sessions = await getBoardSessions(req.params.boardId, req.user.id);
    res.json(
      new ApiResponse(
        200,
        sessions,
        "Collaboration sessions fetched successfully",
      ),
    );
  }),
);
router.get(
  "/collaboration/sessions/:sessionId",
  asyncHandler(async (req, res) => {
    const details = await getSessionDetails(req.params.sessionId, req.user.id);
    res.json(
      new ApiResponse(
        200,
        details,
        "Collaboration session details fetched successfully",
      ),
    );
  }),
);
router.post(
  "/collaboration/boards/:boardId/sessions",
  validate(sessionSchema),
  asyncHandler(async (req, res) => {
    const session = await startBoardSession(
      req.params.boardId,
      req.user.id,
      req.body,
    );
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          session,
          "Collaboration session started successfully",
        ),
      );
  }),
);
router.post(
  "/collaboration/sessions/:sessionId/continue",
  asyncHandler(async (req, res) => {
    const session = await continueBoardSession(
      req.params.sessionId,
      req.user.id,
      req.body || {},
    );
    res
      .status(201)
      .json(
        new ApiResponse(201, session, "Collaboration continued successfully"),
      );
  }),
);
router.patch(
  "/collaboration/sessions/:sessionId/end",
  asyncHandler(async (req, res) => {
    const session = await endBoardSession(req.params.sessionId, req.user.id);
    res.json(
      new ApiResponse(200, session, "Collaboration session ended successfully"),
    );
  }),
);
router.delete(
  "/collaboration/sessions/:sessionId/participants/me",
  asyncHandler(async (req, res) => {
    const session = await leaveBoardSession(req.params.sessionId, req.user.id);
    res.json(
      new ApiResponse(200, session, "You left the collaboration session"),
    );
  }),
);
router.delete(
  "/collaboration/boards/:boardId/sessions",
  asyncHandler(async (req, res) => {
    const result = await clearBoardSessions(req.params.boardId, req.user.id);
    res.json(
      new ApiResponse(
        200,
        result,
        "Collaboration session history cleared successfully",
      ),
    );
  }),
);

export default router;
