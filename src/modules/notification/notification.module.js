import NotificationRepository from "./repositories/notification.repository.js";
import { NotificationSettingRepository } from "./repositories/notificationSetting.repository.js";
import { NotificationSettingService } from "./services/notificationSetting.service.js";
import { NotificationSSEService } from "./services/notificationSSE.service.js";
import NotificationService from "./services/notification.service.js";
import { NotificationBroadcastService } from "./services/notificationBroadcast.service.js";
import { NotificationController } from "./notification.controller.js";
import { createNotificationRouter } from "./notification.routes.js";
import { registerFollowNotificationListener } from "./listeners/follow.notification.listener.js";
import { registerProjectNotificationListener } from "./listeners/project.notification.listener.js";
import { registerProjectReviewNotificationListener } from "./listeners/projectReview.notification.listener.js";
import { registerOrganizerRequestSubmittedNotificationListener } from "./listeners/organizerRequestSubmitted.notification.listener.js";
import { registerOrganizerRequestNotificationListener } from "./listeners/organizerRequest.notification.listener.js";
import { registerSystemNotificationListener } from "./listeners/system.notification.listener.js";
import { registerPostNotificationListener } from "./listeners/post.notification.listener.js";
import { registerChatNotificationListener } from "./listeners/chat.notification.listener.js";
import { registerTransactionNotificationListener } from "./listeners/transaction.notification.listener.js";
import { NOTIFICATION_DEFAULTS } from "./constants/notification.constants.js";
import { InMemoryStreamSessionStore } from "./infrastructure/inMemoryStreamSessionStore.js";
import { InMemoryNotificationClientRegistry } from "./infrastructure/inMemoryNotificationClientRegistry.js";
import { RedisStreamSessionStore } from "./infrastructure/redisStreamSessionStore.js";
import { RedisNotificationRealtimeGateway } from "./infrastructure/redisNotificationRealtimeGateway.js";

const registeredListenerBuses = new WeakSet();

function createDefaultLogger() {
  return {
    error(message, meta) {
      console.error(message, meta);
    },
    info(message, meta) {
      console.log(message, meta);
    },
  };
}

function defaultCreateError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeStreamCookieOptions(streamCookieOptions = {}) {
  const merged = {
    httpOnly: true,
    sameSite: "lax",
    path: NOTIFICATION_DEFAULTS.SSE_COOKIE_PATH,
    maxAge: NOTIFICATION_DEFAULTS.SSE_SESSION_TTL_MS,
    ...streamCookieOptions,
  };

  const sameSite =
    typeof merged.sameSite === "string"
      ? merged.sameSite.toLowerCase()
      : merged.sameSite;

  if (sameSite === "none" && merged.secure !== true) {
    throw new Error(
      "streamCookieOptions.secure must be true when streamCookieOptions.sameSite is 'none'"
    );
  }

  return merged;
}

function createStreamAuthenticate({
  notificationSSEService,
  streamCookieName,
  streamCookieOptions,
  createError,
}) {
  return (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const token = req.cookies?.[streamCookieName];

        if (!token) {
          throw createError("Unauthorized", 401);
        }

        const session = await notificationSSEService.consumeStreamSession(token);

        if (!session?.userId) {
          throw createError("Unauthorized", 401);
        }

        req.user = {
          ...(req.user || {}),
          userId: session.userId,
        };

        res.clearCookie(streamCookieName, {
          path: streamCookieOptions.path,
          sameSite: streamCookieOptions.sameSite,
          secure: streamCookieOptions.secure,
          domain: streamCookieOptions.domain,
        });

        next();
      })
      .catch(next);
  };
}

function registerDomainListeners({
  eventBus,
  notificationService,
  notificationBroadcastService,
  mailProvider = null,
  userRepository = null,
  logger,
}) {
  if (registeredListenerBuses.has(eventBus)) {
    logger?.info?.(
      "[NotificationModule] Domain listeners already registered for this event bus"
    );
    return;
  }

  logger?.info?.("[NotificationModule] Registering follow notification listener");
  registerFollowNotificationListener({
    eventBus,
    notificationService,
    logger,
  });

  logger?.info?.("[NotificationModule] Registering project notification listener");
  registerProjectNotificationListener({
    eventBus,
    notificationService,
    mailProvider,
    userRepository,
    logger,
  });

  logger?.info?.("[NotificationModule] Registering project review notification listener");
  registerProjectReviewNotificationListener({
    eventBus,
    notificationBroadcastService,
    logger,
  });

  logger?.info?.(
    "[NotificationModule] Registering organizer request submitted notification listener"
  );
  registerOrganizerRequestSubmittedNotificationListener({
    eventBus,
    notificationBroadcastService,
    logger,
  });

  logger?.info?.(
    "[NotificationModule] Registering organizer request notification listener"
  );
  registerOrganizerRequestNotificationListener({
    eventBus,
    notificationService,
    logger,
  });

  logger?.info?.("[NotificationModule] Registering system notification listener");
  registerSystemNotificationListener({
    eventBus,
    notificationBroadcastService,
    logger,
  });

  registerTransactionNotificationListener({
    eventBus,
    notificationService,
    notificationBroadcastService,
    mailProvider,
    userRepository,
    logger,
  });

  logger?.info?.("[NotificationModule] Registering post notification listener");
  registerPostNotificationListener({
    eventBus,
    notificationService,
    logger,
  });

  logger?.info?.("[NotificationModule] Registering chat notification listener");
  registerChatNotificationListener({
    eventBus,
    notificationService,
    logger,
  });

  registeredListenerBuses.add(eventBus);
  logger?.info?.("[NotificationModule] All domain listeners registered successfully");
}

function resolveStreamSessionStore({ redis, streamSessionStore }) {
  if (streamSessionStore) {
    return streamSessionStore;
  }

  if (redis) {
    return new RedisStreamSessionStore({ redis });
  }

  return new InMemoryStreamSessionStore();
}

function resolveRealtimeGateway({ redis, logger }) {
  if (!redis) {
    return null;
  }

  return new RedisNotificationRealtimeGateway({
    redis,
    logger,
  });
}

export async function createNotificationModule({
  authenticate,
  eventBus,
  responsePresenter = null,
  logger = createDefaultLogger(),
  streamCookieOptions = {},
  validateInput,
  createError = defaultCreateError,
  resolveAllUserIds = null,
  resolveUserIdsByRole = null,
  resolveUsersByIds = null,
  redis = null,
  streamSessionStore = null,
  clientRegistry = new InMemoryNotificationClientRegistry(),
  mailProvider = null,
  userRepository = null,
} = {}) {
  if (typeof authenticate !== "function") {
    throw new Error("createNotificationModule requires authenticate middleware");
  }

  if (
    !eventBus ||
    typeof eventBus.on !== "function" ||
    typeof eventBus.emit !== "function"
  ) {
    throw new Error("createNotificationModule requires a shared eventBus instance");
  }

  logger?.info?.("[NotificationModule] Starting notification module creation");

  const notificationRepository = new NotificationRepository();
  const notificationSettingRepository = new NotificationSettingRepository();

  const notificationSettingService = new NotificationSettingService({
    notificationSettingRepository,
  });

  const notificationSSEService = new NotificationSSEService({
    streamSessionStore: resolveStreamSessionStore({ redis, streamSessionStore }),
    clientRegistry,
  });

  const notificationRealtimeGateway = resolveRealtimeGateway({
    redis,
    logger,
  });

  const notificationService = new NotificationService({
    notificationRepository,
    notificationSettingService,
    notificationSSEService,
    notificationRealtimeGateway,
    logger,
    createError,
  });

  const notificationBroadcastService = new NotificationBroadcastService({
    notificationService,
    resolveAllUserIds,
    resolveUserIdsByRole,
    resolveUsersByIds,
    logger,
  });

  const mergedStreamCookieOptions = normalizeStreamCookieOptions(
    streamCookieOptions
  );

  const controller = new NotificationController({
    notificationService,
    notificationSettingService,
    notificationSSEService,
    responsePresenter,
    validateInput,
    createError,
    streamCookieOptions: mergedStreamCookieOptions,
  });

  const streamAuthenticate = createStreamAuthenticate({
    notificationSSEService,
    streamCookieName: NOTIFICATION_DEFAULTS.SSE_COOKIE_NAME,
    streamCookieOptions: mergedStreamCookieOptions,
    createError,
  });

  const router = createNotificationRouter({
    controller,
    authenticate,
    streamAuthenticate,
  });

  if (notificationRealtimeGateway) {
    logger?.info?.("[NotificationModule] Starting realtime gateway");
    await notificationRealtimeGateway.start({
      onUserEvent({ userId, eventName, payload }) {
        notificationSSEService.emitToUser(userId, eventName, payload);
      },
    });
  }

  registerDomainListeners({
    eventBus,
    notificationService,
    notificationBroadcastService,
    mailProvider,
    userRepository,
    logger,
  });

  logger?.info?.("[NotificationModule] Notification module created successfully");

  return {
    router,
    controller,
    services: {
      notificationService,
      notificationSettingService,
      notificationSSEService,
      notificationBroadcastService,
      notificationRealtimeGateway,
    },
    repositories: {
      notificationRepository,
      notificationSettingRepository,
    },
  };
}
