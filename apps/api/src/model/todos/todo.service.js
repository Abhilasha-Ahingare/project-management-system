import Todo from "./todo.model.js";
import ApiError from "../../utils/ApiError.js";
import { getAccessibleProject } from "../projects/project-access.service.js";

const assertProjectAccess = async (projectId, userId) => {
  return getAccessibleProject(projectId, userId);
};

export const listTodos = async (projectId, userId) => {
  await assertProjectAccess(projectId, userId);
  return Todo.find({
    project: projectId,
    owner: userId,
    completed: false,
    isActive: true,
  }).sort({ createdAt: 1 });
};

export const createTodo = async (projectId, title, userId) => {
  await assertProjectAccess(projectId, userId);
  return Todo.create({
    project: projectId,
    owner: userId,
    title: title.trim(),
  });
};

export const updateTodo = async (todoId, payload, userId) => {
  const todo = await Todo.findOne({
    _id: todoId,
    owner: userId,
    isActive: true,
  });
  if (!todo) throw new ApiError(404, "Todo not found");
  await assertProjectAccess(todo.project, userId);
  if (payload.title !== undefined) todo.title = payload.title.trim();
  if (payload.completed !== undefined) todo.completed = payload.completed;
  await todo.save();
  return todo;
};

export const deleteTodo = async (todoId, userId) => {
  const todo = await Todo.findOne({
    _id: todoId,
    owner: userId,
    isActive: true,
  });
  if (!todo) throw new ApiError(404, "Todo not found");
  await assertProjectAccess(todo.project, userId);
  todo.isActive = false;
  await todo.save();
  return { deleted: true };
};
