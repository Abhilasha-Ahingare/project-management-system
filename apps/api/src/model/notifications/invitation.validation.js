import Joi from "joi";

export const createInvitationSchema = Joi.object({
  targetType: Joi.string().valid("Project", "Team", "Collaboration").required(),
  targetId: Joi.string().required(),
  email: Joi.string().trim().lowercase().email().required(),
  role: Joi.string().valid("lead", "admin", "member").default("member"),
});

export const respondInvitationSchema = Joi.object({
  decision: Joi.string().valid("accepted", "rejected").required(),
});
