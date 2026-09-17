import express from "express";
import Joi from "joi";
import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listMessages,
  createMessage,
  pinMessage,
  permanentlyDeleteMessage,
  permanentlyClearProjectMessages,
} from "./chat.service.js";

const router = express.Router();
const messageSchema = Joi.object({
  text: Joi.string().trim().max(4000).allow("").default(""),
  attachmentId: Joi.string().allow(null, ""),
  mentionedUserIds: Joi.array().items(Joi.string()).max(20).default([]),
}).custom((value, helpers) => {
  if (!value.text && !value.attachmentId) return helpers.error("any.invalid");
  return value;
});
router.use(authMiddleware);
router.get(
  "/chat/:scopeType/:scopeId",
  asyncHandler(async (req, res) => {
    const messages = await listMessages(
      req.params.scopeType,
      req.params.scopeId,
      req.user.id,
    );
    res.json(
      new ApiResponse(200, messages, "Chat messages fetched successfully"),
    );
  }),
);
router.post(
  "/chat/:scopeType/:scopeId",
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    const message = await createMessage(
      req.params.scopeType,
      req.params.scopeId,
      req.body,
      req.user.id,
    );
    res
      .status(201)
      .json(new ApiResponse(201, message, "Message sent successfully"));
  }),
);
router.patch(
  "/chat/messages/:messageId/pin",
  validate(Joi.object({ isPinned: Joi.boolean().required() })),
  asyncHandler(async (req, res) => {
    const message = await pinMessage(
      req.params.messageId,
      req.body.isPinned,
      req.user.id,
    );
    res.json(new ApiResponse(200, message, "Message pin updated successfully"));
  }),
);
router.delete(
  "/chat/messages/:messageId",
  asyncHandler(async (req, res) => {
    const result = await permanentlyDeleteMessage(
      req.params.messageId,
      req.user.id,
    );
    res.json(new ApiResponse(200, result, "Message deleted permanently"));
  }),
);
router.delete(
  "/chat/Project/:projectId",
  asyncHandler(async (req, res) => {
    const result = await permanentlyClearProjectMessages(
      req.params.projectId,
      req.user.id,
    );
    res.json(new ApiResponse(200, result, "Project chat cleared permanently"));
  }),
);
export default router;
