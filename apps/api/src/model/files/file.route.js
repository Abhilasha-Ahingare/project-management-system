import express from "express";
import multer from "multer";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  uploadFileController,
  listFilesController,
  downloadFileController,
  deleteFileController,
} from "./file.controller.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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
