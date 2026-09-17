import express from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
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
router.use(authMiddleware);

router
  .route("/notifications")
  .get(getNotificationsController)
  .post(validate(createNotificationSchema), createNotificationController);
router.patch("/notifications/read-all", markAllNotificationsAsReadController);
router.delete("/notifications", deleteAllNotificationsController);
router.patch(
  "/notifications/:notificationId/read",
  markNotificationAsReadController,
);
router.delete("/notifications/:notificationId", deleteNotificationController);

export default router;
