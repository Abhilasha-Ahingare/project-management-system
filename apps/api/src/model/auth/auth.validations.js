import Joi from "joi";

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),

  email: Joi.string().trim().lowercase().email().required(),

  password: Joi.string().min(8).max(72).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),

  password: Joi.string().min(1).max(72).required(),
});
