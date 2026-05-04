import { asValue } from "awilix";

import { config } from "./index.js";
import ApiResponse from "../core/Response.js";
import AppError from "../core/AppError.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { createNotificationModule } from "../modules/notification/notification.module.js";
import { DOMAIN_EVENTS } from "../modules/notification/constants/notification.events.js";
import User from "../modules/user/user.model.js";
import { getContainer } from "../container/index.js";
import { getSharedEventBus } from "../core/eventBus.js";

function createDefaultLogger() {
  return {
    info: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
  };
}

function resolveRedisInstance() {
  try {
    const container = getContainer();
    return container.resolve("redis");
  } catch {
    return null;
  }
}

function resolveMailProvider() {
  try {
    const container = getContainer();
    return container.resolve("mailProvider");
  } catch {
    return null;
  }
}

function resolveUserRepository() {
  try {
    const container = getContainer();
    return container.resolve("userRepository");
  } catch {
    return null;
  }
}

function registerNotificationModuleInContainer(notificationModule) {
  if (!notificationModule) return;

  try {
    const container = getContainer();

    const services = notificationModule.services || {};
    const repositories = notificationModule.repositories || {};

    container.register({
      notificationModule: asValue(notificationModule),

      notificationService: asValue(services.notificationService),
      notificationSettingService: asValue(services.notificationSettingService),
      notificationSSEService: asValue(services.notificationSSEService),
      notificationBroadcastService: asValue(services.notificationBroadcastService),
      notificationRealtimeGateway: asValue(services.notificationRealtimeGateway),

      notificationRepository: asValue(repositories.notificationRepository),
      notificationSettingRepository: asValue(
        repositories.notificationSettingRepository
      ),
    });

    console.log(
      "[NotificationConfig] Notification services registered in DI container"
    );
  } catch (error) {
    console.error(
      "[NotificationConfig] Failed to register notification services in DI container",
      error
    );
  }
}

export const eventBus = getSharedEventBus();

export async function createConfiguredNotificationModule({
  eventBus: customEventBus = eventBus,
} = {}) {
  const notificationModule = await createNotificationModule({
    authenticate,
    eventBus: customEventBus,
    redis: resolveRedisInstance(),
    mailProvider: resolveMailProvider(),
    userRepository: resolveUserRepository(),
    responsePresenter: {
      success(res, data, message) {
        return ApiResponse.success(res, data, message);
      },
    },
    logger: createDefaultLogger(),
    createError: (message, status) => new AppError(message, status),
    streamCookieOptions: {
      secure: config.env === "production",
      sameSite: config.notification.streamCrossSite ? "none" : "lax",
    },
    resolveAllUserIds: async () => {
      const users = await User.find({}, { _id: 1 }).lean();
      return users.map((user) => String(user._id));
    },
    resolveUserIdsByRole: async (role) => {
      const users = await User.find(
        { role, isActive: true, status: "active" },
        { _id: 1 }
      ).lean();

      return users.map((user) => String(user._id));
    },
    resolveUsersByIds: async (ids = []) => {
      const normalizedIds = [...new Set((ids || []).map(String).filter(Boolean))];

      if (!normalizedIds.length) return [];

      return User.find(
        { _id: { $in: normalizedIds } },
        { _id: 1, fullName: 1, email: 1, role: 1, avatar: 1 }
      ).lean();
    },
  });

  registerNotificationModuleInContainer(notificationModule);

  return notificationModule;
}

export { DOMAIN_EVENTS };