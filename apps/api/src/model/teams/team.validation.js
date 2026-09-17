import Joi from "joi";

export const createTeamSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  description: Joi.string().trim().max(1000).allow("").optional(),
  projectId: Joi.string().allow(null, "").optional(),
  memberEmails: Joi.array()
    .items(Joi.string().trim().lowercase().email())
    .default([]),
});

export const updateTeamSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80),
  description: Joi.string().trim().max(1000).allow(""),
  projectId: Joi.string().allow(null, ""),
  memberEmails: Joi.array()
    .items(Joi.string().trim().lowercase().email())
    .default([]),
}).min(1);

export const addTeamMemberSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  role: Joi.string().valid("lead", "admin", "member").default("member"),
});
