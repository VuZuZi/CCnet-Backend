// src/lib/redis.js
import Redis from 'ioredis';

// Tạo fake Redis client nếu không có URL thật
class NoopRedis {
    async get() { return null; }
    async set() { return true; }
    async del() { return true; }
    async publish() { return true; }
    async subscribe() { return true; }
    on() { return this; }
    quit() { return Promise.resolve(); }
}

// Kiểm tra URL có phải localhost không
const redisUrl = process.env.REDIS_URL;
const isLocalRedis = !redisUrl || redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1');

let redisClient;

if (!isLocalRedis && redisUrl) {
    try {
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            retryStrategy: () => null,
            lazyConnect: true,
        });

        redisClient.on('error', (err) => {
            console.warn('⚠️ Redis error, using noop cache:', err.message);
            redisClient = new NoopRedis();
        });

        console.log('✅ Redis configured');
    } catch (err) {
        console.warn('⚠️ Redis init failed:', err.message);
        redisClient = new NoopRedis();
    }
} else {
    console.log('ℹ️ Redis not configured, using noop cache');
    redisClient = new NoopRedis();
}

export default redisClient;