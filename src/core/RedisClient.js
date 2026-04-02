import Redis from 'ioredis';

class RedisClient {
  constructor({ config }) {
    this.config = config.redis;
    const redisUrl = process.env.REDIS_URL;

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on('connect', () => console.log('Redis connected'));
    this.client.on('ready', () => console.log('Redis ready'));
    this.client.on('error', (err) => console.error('Redis error:', err));
  }

  getClient() {
    return this.client;
  }

  async get(key) {
    const data = await this.client.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  async incr(key) {
    return await this.client.incr(key);
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

  async publish(channel, payload) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return await this.client.publish(channel, message);
  }

  async deletePattern(pattern) {
    const stream = this.client.scanStream({ match: pattern, count: 500 });
    let count = 0;

    for await (const keys of stream) {
      if (keys.length > 0) {
        const pipeline = this.client.pipeline();
        keys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
        count += keys.length;
      }
    }

    return count;
  }

  async scanAndGetValues(pattern) {
    const stream = this.client.scanStream({ match: pattern, count: 500 });
    const keyValues = [];

    for await (const keys of stream) {
      if (keys.length > 0) {
        const pipeline = this.client.pipeline();
        keys.forEach(key => pipeline.get(key));
        const results = await pipeline.exec();

        keys.forEach((key, index) => {
          const value = parseInt(results[index][1], 10) || 0;
          keyValues.push({ key, value });
        });
      }
    }

    return keyValues;
  }
}

export default RedisClient;