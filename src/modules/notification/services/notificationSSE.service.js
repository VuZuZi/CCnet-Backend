import crypto from 'node:crypto';
import {
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_SSE_EVENTS,
} from '../constants/notification.constants.js';
import { InMemoryStreamSessionStore } from '../infrastructure/inMemoryStreamSessionStore.js';
import { InMemoryNotificationClientRegistry } from '../infrastructure/inMemoryNotificationClientRegistry.js';

function createClientId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

class NotificationSSEService {
  constructor({
    heartbeatMs = NOTIFICATION_DEFAULTS.SSE_HEARTBEAT_MS,
    sessionTtlMs = NOTIFICATION_DEFAULTS.SSE_SESSION_TTL_MS,
    streamSessionStore = new InMemoryStreamSessionStore(),
    clientRegistry = new InMemoryNotificationClientRegistry(),
  } = {}) {
    this.heartbeatMs =
      Number(heartbeatMs) || NOTIFICATION_DEFAULTS.SSE_HEARTBEAT_MS;
    this.sessionTtlMs =
      Number(sessionTtlMs) || NOTIFICATION_DEFAULTS.SSE_SESSION_TTL_MS;

    this.streamSessionStore = streamSessionStore;
    this.clientRegistry = clientRegistry;
    this.heartbeatTimer = null;
  }

  async createStreamSession(userId) {
    if (!userId) {
      throw new Error('Cannot create stream session without userId');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session = await this.streamSessionStore.set(
      token,
      { userId: String(userId) },
      this.sessionTtlMs
    );

    return {
      token,
      expiresAt: session.expiresAt,
    };
  }

  async consumeStreamSession(token) {
    return this.streamSessionStore.consume(token);
  }

  hasActiveClients(userId) {
    return this.getClientsByUserId(userId).length > 0;
  }

  getClientsByUserId(userId) {
    return this.clientRegistry.getByUserId(String(userId));
  }

  getAllClientGroups() {
    return this.clientRegistry.getAll();
  }

  attachClient({ userId, req, res }) {
    const normalizedUserId = String(userId);

    this.prepareStreamResponse(req, res);

    const client = {
      id: createClientId(),
      userId: normalizedUserId,
      req,
      res,
      isClosed: false,
    };

    const cleanup = () => {
      if (client.isClosed) return;
      client.isClosed = true;
      this.detachClient(client);
    };

    this.clientRegistry.add(normalizedUserId, client);
    this.ensureHeartbeat();

    req.once('close', cleanup);
    req.once('error', cleanup);
    res.once('close', cleanup);
    res.once('error', cleanup);

    this.emitConnected(client.res);

    return client;
  }

  detachClient(client) {
    if (!client) return;

    this.clientRegistry.remove(client.userId, client.id);

    if (this.clientRegistry.getTotalClients() === 0) {
      this.stopHeartbeat();
    }
  }

  prepareStreamResponse(req, res) {
    req.socket?.setKeepAlive?.(true);
    req.socket?.setNoDelay?.(true);
    req.socket?.setTimeout?.(0);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.safeWrite(res, `retry: ${NOTIFICATION_DEFAULTS.SSE_RETRY_MS}\n\n`);
  }

  emitConnected(res) {
    this.send(res, NOTIFICATION_SSE_EVENTS.CONNECTED, {
      connected: true,
      at: new Date().toISOString(),
    });
  }

  emitHeartbeat(client) {
    return this.send(client.res, NOTIFICATION_SSE_EVENTS.HEARTBEAT, {
      at: new Date().toISOString(),
    });
  }

  emitToUser(userId, event, payload) {
    const clients = [...this.getClientsByUserId(userId)];

    for (const client of clients) {
      const didWrite = this.send(client.res, event, payload);

      if (!didWrite) {
        this.detachClient(client);
      }
    }
  }

  ensureHeartbeat() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      for (const clients of this.getAllClientGroups().values()) {
        for (const client of [...clients]) {
          const didWrite = this.emitHeartbeat(client);

          if (!didWrite) {
            this.detachClient(client);
          }
        }
      }

      if (this.clientRegistry.getTotalClients() === 0) {
        this.stopHeartbeat();
      }
    }, this.heartbeatMs);

    this.heartbeatTimer.unref?.();
  }

  stopHeartbeat() {
    if (!this.heartbeatTimer) return;

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  send(res, event, payload) {
    if (!this.isWritable(res)) {
      return false;
    }

    const eventWritten = this.safeWrite(res, `event: ${event}\n`);
    const dataWritten = this.safeWrite(res, `data: ${JSON.stringify(payload)}\n\n`);

    return eventWritten && dataWritten;
  }

  isWritable(res) {
    return Boolean(res) && !res.writableEnded && !res.destroyed;
  }

  safeWrite(res, chunk) {
    try {
      if (!this.isWritable(res)) {
        return false;
      }

      res.write(chunk);
      return true;
    } catch {
      return false;
    }
  }
}

export { NotificationSSEService };
export default NotificationSSEService;