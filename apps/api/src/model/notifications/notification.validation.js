import Joi from "joi";

export const createNotificationSchema = Joi.object({
  type: Joi.string().valid("in-app", "email", "push").default("in-app"),
  title: Joi.string().trim().min(1).max(200).required(),
  message: Joi.string().trim().min(1).max(1000).required(),
  entityType: Joi.string()
    .valid("Project", "Task", "Comment", "Team", "Collaboration")
    .optional()
    .allow(null),
  entityId: Joi.string().optional().allow(null),
  metadata: Joi.object().optional(),
});
