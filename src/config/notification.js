import { config } from './index.js';
import ApiResponse from '../core/Response.js';
import AppError from '../core/AppError.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { createNotificationModule } from '../modules/notification/notification.module.js';
import { DOMAIN_EVENTS } from '../modules/notification/constants/notification.events.js';
import User from '../modules/user/user.model.js';
import { getContainer } from '../container/index.js';
import { getSharedEventBus } from '../core/eventBus.js';

function createDefaultLogger() {
  return {
    info: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
  };
}

function resolveRedisInstance() {
  try {
    const container = getContainer();
    return container.resolve('redis');
  } catch {
    return null;
  }
}

function resolveMailProvider() {
  try {
    const container = getContainer();
    return container.resolve('mailProvider');
  } catch {
    return null;
  }
}

function resolveUserRepository() {
  try {
    const container = getContainer();
    return container.resolve('userRepository');
  } catch {
    return null;
  }
}

export const eventBus = getSharedEventBus();

export async function createConfiguredNotificationModule({
  eventBus: customEventBus = eventBus,
} = {}) {
  return createNotificationModule({
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
      secure: config.env === 'production',
      sameSite: config.notification.streamCrossSite ? 'none' : 'lax',
    },
    resolveAllUserIds: async () => {
      const users = await User.find({}, { _id: 1 }).lean();
      return users.map((user) => String(user._id));
    },
    resolveUserIdsByRole: async (role) => {
      const users = await User.find({ role }, { _id: 1 }).lean();
      return users.map((user) => String(user._id));
    },
  });
}

export { DOMAIN_EVENTS };