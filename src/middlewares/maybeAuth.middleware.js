import { getContainer } from "../container/index.js";

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
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName,
      avatar: decoded.avatar,
      username: decoded.username || decoded.email.split("@")[0],
    };
    next();
  } catch {
    next();
  }
};

