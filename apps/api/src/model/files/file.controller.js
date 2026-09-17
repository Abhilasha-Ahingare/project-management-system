import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  saveUploadedFile,
  getFilesForResource,
  getFileForDownload,
  getFileStoragePath,
  deleteFile,
} from "./file.service.js";

export const uploadFileController = asyncHandler(async (req, res) => {
  const file = await saveUploadedFile({
    file: req.file,
    targetType: req.params.targetType,
    targetId: req.params.targetId,
    userId: req.user.id,
  });
  res
    .status(201)
    .json(new ApiResponse(201, file, "File uploaded successfully"));
});

export const listFilesController = asyncHandler(async (req, res) => {
  const files = await getFilesForResource(
    req.params.targetType,
    req.params.targetId,
    req.user.id,
  );
  res
    .status(200)
    .json(new ApiResponse(200, files, "Files fetched successfully"));
});

export const downloadFileController = asyncHandler(async (req, res) => {
  const file = await getFileForDownload(req.params.fileId, req.user.id);
  res.type(file.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(file.originalName)}"`,
  );
  res.sendFile(getFileStoragePath(file.storageName));
});

export const deleteFileController = asyncHandler(async (req, res) => {
  const result = await deleteFile(req.params.fileId, req.user.id);
  res
    .status(200)
    .json(new ApiResponse(200, result, "File deleted successfully"));
});
