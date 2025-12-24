import ApiResponse from '../core/Response.js';

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map(e => ({
       field: e.path,
       message: e.message
    }));
  }

  if (err.code === 11000) {
    statusCode = 409; 
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists. Please use another value.`;
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  if (statusCode === 500) {
     console.error(' UNEXPECTED ERROR:', err);
  } else if (process.env.NODE_ENV === 'development') {
     console.error(' Operational Error:', message);
  }

  return ApiResponse.error(res, message, statusCode, errors);
};

export default errorHandler;