import crypto from 'node:crypto';

function buildKey(token) {
  return `notification:stream:${token}`;
}

export class RedisStreamSessionStore {
  constructor({ redis }) {
    if (!redis) {
      throw new Error('RedisStreamSessionStore requires redis');
    }

    this.redis = redis;
  }

  async set(token, value, ttlMs) {
    const payload = {
      ...value,
      expiresAt: Date.now() + ttlMs,
      nonce: crypto.randomBytes(8).toString('hex'),
    };

    await this.redis.set(buildKey(token), payload, 'PX', ttlMs);

    return payload;
  }

  async consume(token) {
    const key = buildKey(token);
    const client = this.redis.getClient?.();

    if (client?.call) {
      try {
        const raw = await client.call('GETDEL', key);

        if (!raw) return null;

        const session =
          typeof raw === 'string'
            ? JSON.parse(raw)
            : JSON.parse(String(raw));

        if (!session || session.expiresAt <= Date.now()) {
          return null;
        }

        return session;
      } catch {
        // fallback below
      }
    }

    const session = await this.redis.get(key);
    if (!session) return null;

    await this.redis.del(key);

    if (session.expiresAt <= Date.now()) {
      return null;
    }

    return session;
  }
}

export default RedisStreamSessionStore;