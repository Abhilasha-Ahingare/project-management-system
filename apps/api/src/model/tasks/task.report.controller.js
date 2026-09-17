import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  getMyTaskSummary,
  getTaskReportForUser,
} from "./task.report.service.js";

export const getMyTaskSummaryController = asyncHandler(async (req, res) => {
  const summary = await getMyTaskSummary(req.user.id);
  res
    .status(200)
    .json(
      new ApiResponse(200, summary, "My task summary fetched successfully"),
    );
});

export const getTaskReportController = asyncHandler(async (req, res) => {
  const report = await getTaskReportForUser(req.user.id);
  res
    .status(200)
    .json(new ApiResponse(200, report, "Task report fetched successfully"));
});
