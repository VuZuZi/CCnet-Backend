import Redis from 'ioredis'

class NoopRedis {
    async get() { return null }
    async set() { return true }
    async del() { return true }
    async publish() { return true }
    async subscribe() { return true }
    on() { return this }
    quit() { return Promise.resolve() }
}

const redisUrl = process.env.REDIS_URL

let redisClient

if (redisUrl && !redisUrl.includes('localhost') && !redisUrl.includes('127.0.0.1')) {
    try {
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => Math.min(times * 50, 2000),
        })

        redisClient.on('connect', () => {
            console.log('✅ Redis connected')
        })

        redisClient.on('error', (err) => {
            console.warn('⚠️ Redis error:', err.message)
        })

    } catch (err) {
        console.warn('⚠️ Redis init failed:', err.message)
        redisClient = new NoopRedis()
    }
} else {
    console.log('ℹ️ Using NoopRedis (no REDIS_URL)')
    redisClient = new NoopRedis()
}

export default redisClient