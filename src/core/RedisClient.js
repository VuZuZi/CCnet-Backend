import Redis from 'ioredis';

class RedisClient {
  constructor({ config }) {
    this.config = config.redis;

    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.client.on('connect', () => console.log(' Redis connected'));
    this.client.on('error', (err) => console.error(' Redis error:', err));
  }

  getClient() {
    return this.client;
  }

  async publish(channel, payload) {
    return this.client.publish(channel, payload);
  }

  async get(key) {
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (error) {
      return data;
    }
  }

  async set(key, value, expiryMode = null, time = null) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    if (expiryMode && time) {
      return await this.client.set(key, stringValue, expiryMode, time);
    }
    return await this.client.set(key, stringValue);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    return await this.client.exists(key);
  }

  async deletePattern(pattern) {
    const stream = this.client.scanStream({
      match: pattern,
      count: 100
    });

    let count = 0;
    stream.on('data', async (keys) => {
      if (keys.length) {
        const pipeline = this.client.pipeline();
        keys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
        count += keys.length;
      }
    });

    return new Promise((resolve) => {
      stream.on('end', () => resolve(count));
    });
  }
}

export default RedisClient;
