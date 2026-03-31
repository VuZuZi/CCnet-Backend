import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

class JobQueue {
  constructor() {
    this.queues = {};
    this.workers = [];

    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('❌ REDIS_URL is required');
    }

    this.queueConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null
    });

    this.queueConnection.on('connect', () => {
      console.log('[JobQueue] ✅ Redis connected');
    });

    this.queueConnection.on('error', (err) => {
      console.error('[JobQueue - Queue] Redis lỗi:', err.message);
    });
  }

  getQueue(queueName) {
    if (!this.queues[queueName]) {
      this.queues[queueName] = new Queue(queueName, {
        connection: this.queueConnection
      });
    }
    return this.queues[queueName];
  }

  async addJob(queueName, jobName, data, customOptions = {}) {
    const queue = this.getQueue(queueName);

    return await queue.add(jobName, data, {
      removeOnComplete: true,
      removeOnFail: { count: 1000, age: 24 * 3600 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      ...customOptions
    });
  }

  registerWorker(queueName, processor, workerOptions = {}) {
    const workerConnection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null
    });

    workerConnection.on('error', (err) => {
      console.error(`[JobQueue - Worker ${queueName}] Redis lỗi:`, err.message);
    });

    const worker = new Worker(queueName, processor, {
      connection: workerConnection,
      lockDuration: 60000,
      maxStalledCount: 1,
      ...workerOptions
    });

    worker.on('completed', (job) => {
      console.log(`[JobQueue] Job ${job.name} hoàn tất`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[JobQueue] Job ${job?.name} thất bại:`, err.message);
    });

    this.workers.push(worker);
  }

  async close() {
    await Promise.all(this.workers.map(w => w.close()));
    await Promise.all(Object.values(this.queues).map(q => q.close()));
    await this.queueConnection.quit();
  }
}

export default JobQueue;