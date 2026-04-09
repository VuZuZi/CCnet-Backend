import AppError from '../core/AppError.js';
import ApiResponse from '../core/Response.js';

export const validate = (schema) => (req, res, next) => {
  try {
    const validData = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    req.body = validData.body;
    req.query = validData.query;
    req.params = validData.params;
    next();
  } catch (error) {
    const issues = error.issues || error.errors;
    if (issues) {
      const errorMessages = issues.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Validation Error", 400, errorMessages);
    }
    return next(error);
  }
};

export const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    const issues = error.issues || error.errors;
    if (issues) {
      const formattedErrors = issues.map((err) => ({
        field: err.path?.join('.') || 'unknown',
        message: err.message
      }));
      return next(new AppError("Dữ liệu đầu vào không hợp lệ", 400, formattedErrors));
    }
    next(error);
  }
};

export const validateQuery = (schema) => (req, res, next) => {
  try {
    if (!schema) throw new Error("Query Validation schema is undefined.");
    req.query = schema.parse(req.query);
    next();
  } catch (error) {
    const issues = error.issues || error.errors;
    if (issues) {
      const errorMessages = issues.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Query Validation Error", 400, errorMessages);
    }
    return next(error);
  }
};

export const validateParams = (schema) => (req, res, next) => {
  try {
    if (!schema) throw new Error("Params Validation schema is undefined.");
    req.params = schema.parse(req.params);
    next();
  } catch (error) {
    const issues = error.issues || error.errors;
    if (issues) {
      const errorMessages = issues.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Params Validation Error", 400, errorMessages);
    }
    return next(error);
  }
};