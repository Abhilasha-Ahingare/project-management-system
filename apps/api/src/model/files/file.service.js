import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import File from "./file.model.js";
import Task from "../tasks/task.model.js";
import User from "../users/users.model.js";
import ApiError from "../../utils/ApiError.js";
import { getAccessibleProject } from "../projects/project-access.service.js";

const uploadDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../uploads",
);
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
]);
const maxFileSize = 10 * 1024 * 1024;

const getResourceProjectId = async (targetType, targetId) => {
  if (!mongoose.isValidObjectId(targetId)) {
    throw new ApiError(400, "Invalid upload target");
  }
  if (targetType === "Task") {
    const task = await Task.findOne({ _id: targetId, isActive: true });
    return task?.project;
  }
  if (targetType === "Project") return targetId;
  throw new ApiError(400, "Invalid upload target type");
};

const assertAccess = async (targetType, targetId, userId) => {
  const projectId = await getResourceProjectId(targetType, targetId);
  if (!projectId) throw new ApiError(404, "Upload target not found");
  await getAccessibleProject(projectId, userId);
};

export const saveUploadedFile = async ({
  file,
  targetType,
  targetId,
  userId,
}) => {
  if (!file) throw new ApiError(400, "File is required");
  if (!allowedMimeTypes.has(file.mimetype))
    throw new ApiError(400, "File type is not allowed");
  if (file.size > maxFileSize)
    throw new ApiError(400, "File must be 10 MB or smaller");
  await assertAccess(targetType, targetId, userId);

  await fs.mkdir(uploadDirectory, { recursive: true });
  const storageName = `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
  await fs.writeFile(path.join(uploadDirectory, storageName), file.buffer);
  return File.create({
    originalName: file.originalname,
    storageName,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: userId,
    targetType,
    targetId,
  });
};

export const getFilesForResource = async (targetType, targetId, userId) => {
  await assertAccess(targetType, targetId, userId);
  return File.find({ targetType, targetId, isActive: true })
    .populate("uploadedBy", "name email designation")
    .sort({ createdAt: -1 });
};

export const getFileForDownload = async (fileId, userId) => {
  if (!mongoose.isValidObjectId(fileId)) {
    throw new ApiError(400, "Invalid file id");
  }
  const file = await File.findOne({ _id: fileId, isActive: true });
  if (!file) throw new ApiError(404, "File not found");
  await assertAccess(file.targetType, file.targetId, userId);
  try {
    await fs.access(path.join(uploadDirectory, file.storageName));
  } catch {
    throw new ApiError(404, "Stored file is no longer available");
  }
  return file;
};

export const getFileStoragePath = (storageName) =>
  path.join(uploadDirectory, storageName);

export const deleteStoredFile = async (fileId) => {
  const file = await File.findById(fileId);
  if (!file) return;
  await fs.rm(path.join(uploadDirectory, file.storageName), { force: true });
  await File.deleteOne({ _id: file._id });
};

export const deleteFile = async (fileId, userId) => {
  const file = await File.findOne({ _id: fileId, isActive: true });
  if (!file) throw new ApiError(404, "File not found");
  await assertAccess(file.targetType, file.targetId, userId);
  const actor = await User.findById(userId).select("role");
  if (file.uploadedBy.toString() !== userId && actor?.role !== "admin") {
    throw new ApiError(
      403,
      "Only the uploader or administrator can delete this file",
    );
  }
  await fs.rm(path.join(uploadDirectory, file.storageName), { force: true });
  file.isActive = false;
  await file.save();
  return { deleted: true };
};
