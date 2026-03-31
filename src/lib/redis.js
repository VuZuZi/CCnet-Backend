// src/lib/redis.js
import Redis from 'ioredis';
import { config } from '../config/index.js';

class NoopCache {
    async get() { return null; }
    async set() { return true; }
    async del() { return true; }
    async publish() { return true; }
    async subscribe() { return true; }
}

let redisClient = null;

//  Kiểm tra URL từ env
const redisUrl = process.env.REDIS_URL || config.redis?.url;

if (redisUrl && redisUrl !== 'redis://localhost:6379') {
    try {
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => {
                // Không retry để tránh delay startup
                return null;
            },
            enableOfflineQueue: false,
            lazyConnect: true,  // Không kết nối ngay
        });

        redisClient.on('connect', () => {
            console.log(' Redis connected');
        });

        redisClient.on('error', (err) => {
            console.warn('⚠️ Redis error:', err.message);
            redisClient = new NoopCache();
        });

        // Thử kết nối bất đồng bộ
        redisClient.connect().catch((err) => {
            console.warn('⚠️ Redis connection failed:', err.message);
            redisClient = new NoopCache();
        });
    } catch (err) {
        console.warn('⚠️ Redis initialization failed:', err.message);
        redisClient = new NoopCache();
    }
} else {
    console.log('ℹ️ Redis not configured, using noop cache');
    redisClient = new NoopCache();
}

export default redisClient;