import express from "express";
import Joi from "joi";
import authMiddleware from "../../middleware/auth.middleware.js";
import validate from "../../middleware/validation.middleware.js";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
} from "./todo.service.js";

const router = express.Router();
const createSchema = Joi.object({
  title: Joi.string().trim().min(1).max(240).required(),
});
const updateSchema = Joi.object({
  title: Joi.string().trim().min(1).max(240),
  completed: Joi.boolean(),
}).min(1);

router.use(authMiddleware);
router
  .route("/projects/:projectId/todos")
  .get(
    asyncHandler(async (req, res) => {
      const todos = await listTodos(req.params.projectId, req.user.id);
      res.json(new ApiResponse(200, todos, "Todos fetched successfully"));
    }),
  )
  .post(
    validate(createSchema),
    asyncHandler(async (req, res) => {
      const todo = await createTodo(
        req.params.projectId,
        req.body.title,
        req.user.id,
      );
      res
        .status(201)
        .json(new ApiResponse(201, todo, "Todo created successfully"));
    }),
  );
router.patch(
  "/todos/:todoId",
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const todo = await updateTodo(req.params.todoId, req.body, req.user.id);
    res.json(new ApiResponse(200, todo, "Todo updated successfully"));
  }),
);
router.delete(
  "/todos/:todoId",
  asyncHandler(async (req, res) => {
    const result = await deleteTodo(req.params.todoId, req.user.id);
    res.json(new ApiResponse(200, result, "Todo deleted successfully"));
  }),
);

export default router;
