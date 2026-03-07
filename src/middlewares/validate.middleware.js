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
    const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
    return ApiResponse.badRequest(res, "Validation Error", errorMessages);
  }
};