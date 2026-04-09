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
  } catch (error) {
    if (error.errors) {
      const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Validation Error", 400, errorMessages);
    }
    return next(error);
  }
  next(); 
};

export const validateBody = (schema) => (req, res, next) => {
  try {
    if (!schema) {
      throw new Error("CTO Warning: Validation schema is undefined. Check your route imports!");
    }
    req.body = schema.parse(req.body);
  } catch (error) {
    if (error.errors) {
      const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Body Validation Error", 400, errorMessages);
    }
    return next(error);
  }
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  try {
    if (!schema) throw new Error("Query Validation schema is undefined.");
    req.query = schema.parse(req.query);
  } catch (error) {
    if (error.errors) {
      const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Query Validation Error", 400, errorMessages);
    }
    return next(error);
  }
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  try {
    if (!schema) throw new Error("Params Validation schema is undefined.");
    req.params = schema.parse(req.params);
  } catch (error) {
    if (error.errors) {
      const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      return ApiResponse.error(res, "Params Validation Error", 400, errorMessages);
    }
    return next(error);
  }
  next();
};