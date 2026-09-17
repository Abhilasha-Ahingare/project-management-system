import Joi from "joi";

export const createUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  email: Joi.string().trim().lowercase().email().required(),
  designation: Joi.string().trim().max(80).allow("").default(""),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid("admin", "user").default("user"),
  contactNumber: Joi.string().trim().max(20).allow(""),
  address: Joi.string().trim().max(250).allow(""),
  isActive: Joi.boolean().default(true),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50),
  email: Joi.string().trim().lowercase().email(),
  designation: Joi.string().trim().max(80).allow(""),
  password: Joi.string().min(8),
  role: Joi.string().valid("admin", "user"),
  contactNumber: Joi.string().trim().max(20).allow(""),
  address: Joi.string().trim().max(250).allow(""),
  isActive: Joi.boolean(),
}).min(1);
