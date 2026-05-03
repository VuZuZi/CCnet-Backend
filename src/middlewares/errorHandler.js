import ApiResponse from '../core/Response.js';
import { ZodError } from 'zod';

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  /**
   * =========================
   * ZOD VALIDATION ERRORS
   * =========================
   */
  if (err instanceof ZodError || err.name === 'ZodError') {
    statusCode = 400;
    message = 'Dữ liệu không hợp lệ';

    errors = err.issues.map((issue) => {
      let readableMessage = issue.message;

      if (issue.code === 'too_big') {
        readableMessage = `${issue.path.join('.')} không được vượt quá ${issue.maximum} ký tự`;
      }

      if (issue.code === 'too_small') {
        readableMessage = `${issue.path.join('.')} phải có ít nhất ${issue.minimum} ký tự`;
      }

      if (issue.code === 'invalid_type') {
        readableMessage = `${issue.path.join('.')} không đúng định dạng`;
      }

      return {
        field: issue.path.join('.'),
        message: readableMessage,
      };
    });
  }

  /**
   * =========================
   * MONGOOSE VALIDATION
   * =========================
   */
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';

    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  /**
   * =========================
   * DUPLICATE KEY
   * =========================
   */
  else if (err.code === 11000) {
    statusCode = 409;

    const field = Object.keys(err.keyValue || {})[0] || 'field';

    message = `${field} already exists. Please use another value.`;

    errors = [
      {
        field,
        message,
      },
    ];
  }

  /**
   * =========================
   * JWT ERRORS
   * =========================
   */
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  /**
   * =========================
   * APPERROR FALLBACK
   * =========================
   */
  else if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message || message;
    errors = err.errors || errors;
  }

  /**
   * =========================
   * LOGGING
   * =========================
   */
  if (statusCode === 500) {
    console.error('[Global Error] UNEXPECTED ERROR:', err);
  } else if (process.env.NODE_ENV === 'development') {
    console.error('[Global Error] Operational Error:', {
      message,
      statusCode,
      errors,
    });
  }

  /**
   * =========================
   * RESPONSE
   * =========================
   */
  return ApiResponse.error(res, message, statusCode, errors);
};

export default errorHandler;