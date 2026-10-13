import ApiError from "../utils/ApiError.js";

export const validateObjectIdParam =
  (parameterName) => (req, res, next, value) => {
    if (!/^[a-f\d]{24}$/i.test(value))
      return next(new ApiError(400, `Invalid ${parameterName}`));
    next();
  };

const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return next(new ApiError(400, "Validation failed", errors));
    }

    if (source === "body") {
      req.body = value;
    } else {
      req.validated = { ...req.validated, [source]: value };
    }

    next();
  };
};

export default validate;
