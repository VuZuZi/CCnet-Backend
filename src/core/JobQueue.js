import { Queue, Worker } from 'bullmq';
import Redis from '../lib/redis.js';

class JobQueue {
  constructor({ config }) {
    this.queues = {};
    this.workers = [];

    this.redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };

    this.queueConnection = new Redis(this.redisConfig);
    this.queueConnection.on('error', (err) => console.error('[JobQueue - Queue] Redis Lỗi kết nối:', err.message));
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
    const defaultOptions = {
      removeOnComplete: true,
      removeOnFail: { count: 1000, age: 24 * 3600 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    };
    return await queue.add(jobName, data, { ...defaultOptions, ...customOptions });
  }

  async close() {
    await Promise.all(this.workers.map(worker => worker.close()));
    await Promise.all(Object.values(this.queues).map(queue => queue.close()));

    if (this.queueConnection) {
      await this.queueConnection.quit();
    }
    console.log('[JobQueue] Toàn bộ queues, workers và connections đã đóng an toàn.');
  }

  registerWorker(queueName, processor, workerOptions = {}) {
    const workerConnection = new Redis(this.redisConfig);
    workerConnection.on('error', (err) => console.error(`[JobQueue - Worker ${queueName}] Lỗi kết nối:`, err.message));

    const worker = new Worker(queueName, processor, {
      connection: workerConnection,
      lockDuration: 60000,
      maxStalledCount: 1,
      ...workerOptions
    });

    worker.on('completed', (job) => {
      console.log(`[JobQueue] Job ${job.name} in ${queueName} hoàn tất!`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[JobQueue] [CRITICAL] Job ${job?.name} thất bại: ${err.message}`);
    });

    worker.on('closed', () => {
      workerConnection.quit().catch(err => console.error(`[JobQueue] Lỗi đóng connection worker ${queueName}:`, err.message));
    });

    this.workers.push(worker);
    console.log(`[JobQueue] Worker đăng ký thành công cho: ${queueName} (Dedicated Connection)`);
  }
}

export default JobQueue;