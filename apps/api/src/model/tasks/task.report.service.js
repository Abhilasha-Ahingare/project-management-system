import Task from "./task.model.js";
import Project from "../projects/project.model.js";

const activeProjectIdsForUser = async (userId) => {
  const projects = await Project.find({
    isActive: true,
    $or: [
      { owner: userId },
      { "members.user": userId },
      { "collaborators.user": userId, "collaborators.status": "accepted" },
    ],
  }).select("_id");
  return projects.map((project) => project._id);
};

export const getMyTaskSummary = async (userId) => {
  const tasks = await Task.find({ assignee: userId, isActive: true }).select(
    "status dueDate",
  );
  const now = new Date();
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === "todo").length,
    inProgress: tasks.filter((task) => task.status === "in-progress").length,
    review: tasks.filter((task) => task.status === "review").length,
    completed: tasks.filter((task) => task.status === "done").length,
    overdue: tasks.filter(
      (task) => task.status !== "done" && task.dueDate && task.dueDate < now,
    ).length,
    dueToday: tasks.filter(
      (task) =>
        task.dueDate && task.dueDate.toDateString() === now.toDateString(),
    ).length,
  };
};

export const getTaskReportForUser = async (userId) => {
  const projectIds = await activeProjectIdsForUser(userId);
  if (!projectIds.length)
    return {
      total: 0,
      todo: 0,
      inProgress: 0,
      review: 0,
      completed: 0,
      overdue: 0,
    };
  const tasks = await Task.find({
    project: { $in: projectIds },
    isActive: true,
  });
  const now = new Date();
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === "todo").length,
    inProgress: tasks.filter((task) => task.status === "in-progress").length,
    review: tasks.filter((task) => task.status === "review").length,
    completed: tasks.filter((task) => task.status === "done").length,
    overdue: tasks.filter(
      (task) => task.status !== "done" && task.dueDate && task.dueDate < now,
    ).length,
  };
};
