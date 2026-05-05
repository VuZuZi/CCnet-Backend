import AppError from "../core/AppError.js";
import { getContainer } from "../container/index.js";
import {
  assertActiveAuthenticatedUser,
  buildRequestUser,
} from "./authUserStatus.helper.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Unauthorized: Token missing or invalid format", 401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new AppError("Unauthorized: Token missing", 401);
    }

    const container = getContainer();
    const redis = container.resolve("redis");
    const authService = container.resolve("authService");

    try {
      const isBlacklisted = await redis.get(`bl:${token}`);
      if (isBlacklisted) {
        throw new AppError("Session expired or revoked", 401);
      }
    } catch (redisError) {
      if (redisError instanceof AppError) throw redisError;
      console.error(
        "[Auth Middleware] Redis connection failed:",
        redisError.message,
      );
      throw new AppError(
        "Authentication service is temporarily unavailable",
        503,
      );
    }

    const decoded = authService.verifyAccessToken(token);
    const activeUser = await assertActiveAuthenticatedUser({
      container,
      redis,
      decoded,
    });

    req.user = buildRequestUser(decoded, activeUser);

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Token expired", 401));
    }
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token", 401));
    }
    next(error);
  }
};

export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const container = getContainer();
    const redis = container.resolve("redis");
    const authService = container.resolve("authService");

    try {
      const isBlacklisted = await redis.get(`bl:${token}`);
      if (isBlacklisted) return next();
    } catch (redisError) {
      return next();
    }

    const decoded = authService.verifyAccessToken(token);
    const activeUser = await assertActiveAuthenticatedUser({
      container,
      redis,
      decoded,
    });

    req.user = buildRequestUser(decoded, activeUser);

    next();
  } catch (error) {
    next();
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Forbidden: Insufficient permissions", 403));
    }

    const userRole = (req.user.role || "").toLowerCase();
    const isAuthorized = roles.some(
      (role) => role.toLowerCase() === userRole
    );

    if (!isAuthorized) {
      return next(new AppError("Forbidden: Insufficient permissions", 403));
    }
    next();
  };
};
