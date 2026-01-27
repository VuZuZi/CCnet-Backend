import AppError from '../core/AppError.js';
import { getContainer } from '../container/index.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Unauthorized: Token missing', 401);
    }

    const token = authHeader.split(' ')[1];
    
    const container = getContainer();
    const redis = container.resolve('redis');
    const authService = container.resolve('authService');

    const isBlacklisted = await redis.get(`bl:${token}`);
    if (isBlacklisted) {
      throw new AppError('Session expired or revoked', 401);
    }

    const decoded = authService.verifyAccessToken(token);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName,
      avatar: decoded.avatar
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    next(error);
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('Forbidden: Insufficient permissions', 403));
    }
    next();
  };
};