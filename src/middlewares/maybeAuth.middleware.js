import { getContainer } from "../container/index.js";
import {
  assertActiveAuthenticatedUser,
  buildRequestUser,
} from "./authUserStatus.helper.js";

export const maybeAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const container = getContainer();
    const redis = container.resolve("redis");
    const authService = container.resolve("authService");

    try {
      const isBlacklisted = await redis.get(`bl:${token}`);
      if (isBlacklisted) return next();
    } catch {
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
  } catch {
    next();
  }
};

