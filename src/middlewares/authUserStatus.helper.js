import AppError from "../core/AppError.js";
import { getAuthBannedUserKey } from "../modules/auth/authRealtime.constants.js";

const BLOCKED_ACCOUNT_MESSAGE = "Account is deactivated or banned";
const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Authentication service is temporarily unavailable";

const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

export const isBlockedAuthUser = (user) =>
  !user || user.isActive === false || normalizeStatus(user.status) === "banned";

export const buildRequestUser = (decoded, user = {}) => {
  const email = user.email || decoded.email || "";

  return {
    userId: decoded.userId,
    email,
    role: user.role || decoded.role,
    fullName: user.fullName || decoded.fullName,
    avatar: user.avatar || decoded.avatar,
    username:
      user.username ||
      decoded.username ||
      (email ? email.split("@")[0] : ""),
  };
};

export const assertActiveAuthenticatedUser = async ({
  container,
  redis,
  decoded,
}) => {
  const userId = decoded?.userId;

  if (!userId) {
    throw new AppError("Invalid token", 401);
  }

  const bannedKey = getAuthBannedUserKey(userId);

  try {
    const isMarkedBlocked = await redis.get(bannedKey);
    if (isMarkedBlocked) {
      throw new AppError(BLOCKED_ACCOUNT_MESSAGE, 403);
    }
  } catch (redisError) {
    if (redisError instanceof AppError) throw redisError;

    console.error(
      "[Auth Middleware] Redis connection failed:",
      redisError?.message || redisError
    );
    throw new AppError(AUTH_SERVICE_UNAVAILABLE_MESSAGE, 503);
  }

  const userRepository = container.resolve("userRepository");
  const user = await userRepository.findById(userId);

  if (isBlockedAuthUser(user)) {
    try {
      await redis.set(bannedKey, "1");
    } catch (redisError) {
      console.error(
        "[Auth Middleware] Failed to cache blocked user state:",
        redisError?.message || redisError
      );
    }

    throw new AppError(BLOCKED_ACCOUNT_MESSAGE, 403);
  }

  return user;
};
