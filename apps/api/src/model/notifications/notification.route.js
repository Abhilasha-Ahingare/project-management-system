import express from "express";
import Joi from "joi";
import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import { validateObjectIdParam } from "../../middleware/validation.middleware.js";
import {
  createNotificationController,
  getNotificationsController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
  deleteNotificationController,
  deleteAllNotificationsController,
} from "./notification.controller.js";
import { createNotificationSchema } from "./notification.validation.js";

const router = express.Router();
router.param("notificationId", validateObjectIdParam("notificationId"));
router.use(authMiddleware);

router
  .route("/notifications")
  .get(
    validate(
      Joi.object({
        limit: Joi.number().integer().min(1).max(100),
        unreadOnly: Joi.string().valid("true", "false"),
      }),
      "query",
    ),
    getNotificationsController,
  )
  .post(validate(createNotificationSchema), createNotificationController);
router.patch("/notifications/read-all", markAllNotificationsAsReadController);
router.delete("/notifications", deleteAllNotificationsController);
router.patch(
  "/notifications/:notificationId/read",
  markNotificationAsReadController,
);
router.delete("/notifications/:notificationId", deleteNotificationController);

export default router;
