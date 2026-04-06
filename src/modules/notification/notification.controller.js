import {
  listNotificationsSchema,
  notificationIdSchema,
  updateNotificationSettingsSchema,
} from './notification.validation.js';
import { NOTIFICATION_DEFAULTS } from './constants/notification.constants.js';

function defaultValidateInput(schema, data) {
  const { value, error } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const message = error.details.map((item) => item.message).join(', ');
    const validationError = new Error(message);
    validationError.status = 400;
    throw validationError;
  }

  return value;
}

function defaultCreateError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getAuthenticatedUserId(req) {
  return req?.user?.userId || req?.user?.id || null;
}

const defaultResponsePresenter = {
  success(res, data, message = 'Success') {
    return res.json({
      success: true,
      message,
      data,
    });
  },
};

export class NotificationController {
  constructor({
    notificationService,
    notificationSettingService,
    notificationSSEService,
    responsePresenter,
    validateInput = defaultValidateInput,
    createError = defaultCreateError,
    streamCookieOptions = {},
  }) {
    this.notificationService = notificationService;
    this.notificationSettingService = notificationSettingService;
    this.notificationSSEService = notificationSSEService;
    this.responsePresenter = responsePresenter || defaultResponsePresenter;
    this.validateInput = validateInput;
    this.createError = createError;
    this.streamCookieOptions = { ...streamCookieOptions };

    this.getNotifications = this.getNotifications.bind(this);
    this.getUnreadCount = this.getUnreadCount.bind(this);
    this.markAsRead = this.markAsRead.bind(this);
    this.markAllAsRead = this.markAllAsRead.bind(this);
    this.deleteNotification = this.deleteNotification.bind(this);
    this.getSettings = this.getSettings.bind(this);
    this.updateSettings = this.updateSettings.bind(this);
    this.createStreamSession = this.createStreamSession.bind(this);
    this.stream = this.stream.bind(this);
  }

  requireUserId(req) {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      throw this.createError('Unauthorized', 401);
    }

    return userId;
  }

  async getNotifications(req, res, next) {
    try {
      const recipientId = this.requireUserId(req);
      const query = this.validateInput(listNotificationsSchema, req.query);

      const data = await this.notificationService.listNotifications({
        recipientId,
        page: query.page,
        limit: query.limit,
      });

      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async getUnreadCount(req, res, next) {
    try {
      const recipientId = this.requireUserId(req);
      const data = await this.notificationService.getUnreadCount(recipientId);
      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const recipientId = this.requireUserId(req);
      const { id } = this.validateInput(notificationIdSchema, req.params);

      const data = await this.notificationService.markAsRead({
        id,
        recipientId,
      });

      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async markAllAsRead(req, res, next) {
    try {
      const recipientId = this.requireUserId(req);
      const data = await this.notificationService.markAllAsRead(recipientId);
      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async deleteNotification(req, res, next) {
    try {
      const recipientId = this.requireUserId(req);
      const { id } = this.validateInput(notificationIdSchema, req.params);

      const data = await this.notificationService.deleteNotification({
        id,
        recipientId,
      });

      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async getSettings(req, res, next) {
    try {
      const userId = this.requireUserId(req);
      const data = await this.notificationSettingService.getSettings(userId);
      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async updateSettings(req, res, next) {
    try {
      const userId = this.requireUserId(req);
      const body = this.validateInput(updateNotificationSettingsSchema, req.body);

      const data = await this.notificationSettingService.updateSettings(userId, body);
      return this.responsePresenter.success(res, data);
    } catch (error) {
      return next(error);
    }
  }

  async createStreamSession(req, res, next) {
    try {
      const userId = this.requireUserId(req);
      const session = await this.notificationSSEService.createStreamSession(userId);

      res.cookie(
        NOTIFICATION_DEFAULTS.SSE_COOKIE_NAME,
        session.token,
        this.streamCookieOptions
      );

      return this.responsePresenter.success(
        res,
        { expiresAt: session.expiresAt },
        'Stream session created'
      );
    } catch (error) {
      return next(error);
    }
  }

  async stream(req, res, next) {
    try {
      const userId = this.requireUserId(req);

      this.notificationSSEService.attachClient({
        userId,
        req,
        res,
      });
    } catch (error) {
      return next(error);
    }
  }
}