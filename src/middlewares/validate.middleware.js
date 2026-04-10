import { ZodError } from 'zod';
import ApiResponse from '../core/Response.js';
import AppError from '../core/AppError.js';

const getErrorMessages = (error) => {
  if (error instanceof ZodError) {
    return error.issues.map((err) => `${err.path.join('.')}: ${err.message}`);
  }

  if (Array.isArray(error?.errors)) {
    return error.errors.map((err) => `${(err.path || []).join('.')}: ${err.message}`);
  }

  if (Array.isArray(error?.issues)) {
    return error.issues.map((err) => `${(err.path || []).join('.')}: ${err.message}`);
  }

  return null;
};

const handleValidationError = (res, title, error) => {
  const errorMessages = getErrorMessages(error);

  if (!errorMessages) {
    return false;
  }

  return ApiResponse.error(res, title, 400, errorMessages);
};

export const validate = (schema) => (req, res, next) => {
  try {
    const validData = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
      files: req.files,
      file: req.file,
    });

    req.body = validData.body || req.body;
    req.query = validData.query || req.query;
    req.params = validData.params || req.params;
    req.files = validData.files || req.files;
    req.file = validData.file || req.file;

    next();
  } catch (error) {
    const handled = handleValidationError(res, 'Validation Error', error);
    if (handled) return;
    return next(error);
  }
};

export const validateBody = (schema) => (req, res, next) => {
  try {
    if (!schema) {
      throw new Error(
        'CTO Warning: Validation schema is undefined. Check your route imports!'
      );
    }

    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof ZodError || error?.issues || error?.errors) {
      const formattedErrors = (error.issues || error.errors || []).map((err) => ({
        field: err.path?.join('.') || 'unknown',
        message: err.message,
      }));

      return next(new AppError('Dữ liệu đầu vào không hợp lệ', 400, formattedErrors));
    }

    const handled = handleValidationError(res, 'Body Validation Error', error);
    if (handled) return;
    return next(error);
  }
};

export const validateQuery = (schema) => (req, res, next) => {
  try {
    if (!schema) {
      throw new Error('Query Validation schema is undefined.');
    }

    req.query = schema.parse(req.query);
    next();
  } catch (error) {
    const handled = handleValidationError(res, 'Query Validation Error', error);
    if (handled) return;
    return next(error);
  }
};

export const validateParams = (schema) => (req, res, next) => {
  try {
    if (!schema) {
      throw new Error('Params Validation schema is undefined.');
    }

    req.params = schema.parse(req.params);
    next();
  } catch (error) {
    const handled = handleValidationError(res, 'Params Validation Error', error);
    if (handled) return;
    return next(error);
  }
};