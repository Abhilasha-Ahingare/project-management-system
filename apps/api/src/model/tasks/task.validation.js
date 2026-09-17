import Joi from "joi";

export const createTaskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(150).required(),
  description: Joi.string().trim().max(3000).allow("").optional(),
  assigneeId: Joi.string().optional().allow(null),
  status: Joi.string()
    .valid("todo", "in-progress", "review", "done")
    .optional(),
  priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
  dueDate: Joi.date().iso().optional().allow(null),
  tags: Joi.array().items(Joi.string().trim()).optional(),
});

export const updateTaskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(150),
  description: Joi.string().trim().max(3000).allow(""),
  assigneeId: Joi.string().allow(null),
  status: Joi.string().valid("todo", "in-progress", "review", "done"),
  priority: Joi.string().valid("low", "medium", "high", "urgent"),
  dueDate: Joi.date().iso().allow(null),
  tags: Joi.array().items(Joi.string().trim()),
}).min(1);

export const updateTaskStatusSchema = Joi.object({
  status: Joi.string()
    .valid("todo", "in-progress", "review", "done")
    .required(),
}).min(1);
