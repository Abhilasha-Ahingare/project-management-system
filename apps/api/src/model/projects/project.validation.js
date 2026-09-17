import Joi from "joi";

export const createProjectSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(2000).allow("").optional(),
  teamId: Joi.string().optional(),
  status: Joi.string()
    .valid("planning", "active", "on-hold", "completed")
    .optional(),
  priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
  startDate: Joi.date().iso().allow(null).optional(),
  endDate: Joi.date()
    .iso()
    .greater(Joi.ref("startDate"))
    .allow(null)
    .optional(),
});

export const updateProjectSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  description: Joi.string().trim().max(2000).allow(""),
  teamId: Joi.string().allow(null, ""),
  status: Joi.string().valid("planning", "active", "on-hold", "completed"),
  priority: Joi.string().valid("low", "medium", "high", "urgent"),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date()
    .iso()
    .greater(Joi.ref("startDate"))
    .allow(null)
    .optional(),
}).min(1);

export const addProjectMemberSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  role: Joi.string().valid("admin", "lead", "member").default("member"),
});
