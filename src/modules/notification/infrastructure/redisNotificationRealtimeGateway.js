import { NOTIFICATION_REALTIME_CHANNELS } from '../constants/notificationRealtime.constants.js';

const DEFAULT_RETRY_DELAY_MS = 3000;
const MAX_RETRY_DELAY_MS = 30000;

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class RedisNotificationRealtimeGateway {
  constructor({
    redis,
    logger = null,
    channel = NOTIFICATION_REALTIME_CHANNELS.USER_EVENT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    maxRetryDelayMs = MAX_RETRY_DELAY_MS,
  }) {
    if (!redis) {
      throw new Error('RedisNotificationRealtimeGateway requires redis');
    }

    this.redis = redis;
    this.logger = logger;
    this.channel = channel;
    this.retryDelayMs = retryDelayMs;
    this.maxRetryDelayMs = maxRetryDelayMs;

    this.subscriber = null;
    this.isReadyFlag = false;
    this.startPromise = null;
    this.retryTimer = null;
    this.retryAttempt = 0;
    this.onUserEvent = null;
  }

  isReady() {
    return this.isReadyFlag;
  }

  async cleanupSubscriber() {
    if (!this.subscriber) return;

    try {
      this.subscriber.removeAllListeners?.('message');
      this.subscriber.removeAllListeners?.('error');
      this.subscriber.removeAllListeners?.('end');
      this.subscriber.removeAllListeners?.('close');

      if (typeof this.subscriber.unsubscribe === 'function') {
        await this.subscriber.unsubscribe(this.channel).catch(() => null);
      }

      if (typeof this.subscriber.quit === 'function') {
        await this.subscriber.quit().catch(() => null);
      } else if (typeof this.subscriber.disconnect === 'function') {
        this.subscriber.disconnect();
      }
    } catch {
      // no-op
    } finally {
      this.subscriber = null;
      this.isReadyFlag = false;
    }
  }

  clearRetryTimer() {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  scheduleRetry() {
    if (this.retryTimer || !this.onUserEvent) {
      return;
    }

    const delay = Math.min(
      this.retryDelayMs * 2 ** this.retryAttempt,
      this.maxRetryDelayMs
    );

    this.retryAttempt += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.ensureStarted();
    }, delay);

    this.retryTimer.unref?.();

    this.logger?.info?.('Scheduled Redis notification realtime gateway retry', {
      channel: this.channel,
      delay,
      retryAttempt: this.retryAttempt,
    });
  }

  attachSubscriberListeners() {
    if (!this.subscriber) return;

    this.subscriber.on('message', (channel, rawMessage) => {
      if (channel !== this.channel) return;

      const message = safeJsonParse(rawMessage);
      if (!message?.userId || !message?.eventName) {
        return;
      }

      try {
        this.onUserEvent?.({
          userId: String(message.userId),
          eventName: message.eventName,
          payload: message.payload ?? {},
        });
      } catch (error) {
        this.logger?.error?.('Failed to handle Redis notification realtime message', {
          error,
          channel,
          rawMessage,
        });
      }
    });

    this.subscriber.on('error', (error) => {
      this.logger?.error?.('Redis notification subscriber error', {
        error,
        channel: this.channel,
      });
    });

    this.subscriber.on('end', () => {
      this.isReadyFlag = false;
      this.logger?.error?.('Redis notification subscriber ended', {
        channel: this.channel,
      });
      this.scheduleRetry();
    });

    this.subscriber.on('close', () => {
      this.isReadyFlag = false;
      this.logger?.error?.('Redis notification subscriber closed', {
        channel: this.channel,
      });
      this.scheduleRetry();
    });
  }

  async ensureStarted() {
    if (!this.onUserEvent) {
      throw new Error('RedisNotificationRealtimeGateway.ensureStarted requires onUserEvent');
    }

    if (this.isReadyFlag) {
      return this;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      try {
        await this.cleanupSubscriber();

        const baseClient = this.redis.getClient?.();

        if (!baseClient?.duplicate) {
          throw new Error('Redis client does not support duplicate()');
        }

        this.subscriber = baseClient.duplicate();
        this.attachSubscriberListeners();

        await this.subscriber.subscribe(this.channel);

        this.isReadyFlag = true;
        this.retryAttempt = 0;
        this.clearRetryTimer();

        this.logger?.info?.('Redis notification realtime gateway started', {
          channel: this.channel,
        });

        return this;
      } catch (error) {
        await this.cleanupSubscriber();

        this.logger?.error?.('Failed to start Redis notification realtime gateway', {
          error,
          channel: this.channel,
        });

        this.scheduleRetry();
        return null;
      } finally {
        this.startPromise = null;
      }
    })();

    return this.startPromise;
  }

  async start({ onUserEvent }) {
    if (typeof onUserEvent !== 'function') {
      throw new Error('RedisNotificationRealtimeGateway.start requires onUserEvent');
    }

    this.onUserEvent = onUserEvent;
    return this.ensureStarted();
  }

  async publishToUser({ userId, eventName, payload }) {
    if (!userId || !eventName) {
      return false;
    }

    try {
      const message = JSON.stringify({
        userId: String(userId),
        eventName,
        payload: payload ?? {},
      });

      await this.redis.publish(this.channel, message);
      return true;
    } catch (error) {
      this.logger?.error?.('Failed to publish realtime notification event', {
        error,
        channel: this.channel,
        userId,
        eventName,
      });

      return false;
    }
  }
}

export default RedisNotificationRealtimeGateway;