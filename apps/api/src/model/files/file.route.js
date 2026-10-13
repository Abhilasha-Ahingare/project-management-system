import express from "express";
import multer from "multer";
import authMiddleware from "../../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../../middleware/validation.middleware.js";
import {
  uploadFileController,
  listFilesController,
  downloadFileController,
  deleteFileController,
} from "./file.controller.js";

const router = express.Router();
router.param("fileId", validateObjectIdParam("fileId"));
router.param("targetId", validateObjectIdParam("targetId"));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldSize: 64 * 1024,
    parts: 11,
  },
});

router.use(authMiddleware);
router.get("/files/:fileId/download", downloadFileController);
router.post(
  "/files/:targetType/:targetId",
  upload.single("file"),
  uploadFileController,
);
router.get("/files/:targetType/:targetId", listFilesController);
router.delete("/files/:fileId", deleteFileController);

export default router;
