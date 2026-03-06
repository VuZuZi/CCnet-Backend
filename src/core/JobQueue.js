import { Queue, Worker } from 'bullmq';

class JobQueue {
  constructor({ config }) {
    this.queues = {};
    this.workers = [];
    this.redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null, 
    };
  }
  getQueue(queueName) {
    if (!this.queues[queueName]) {
      this.queues[queueName] = new Queue(queueName, { 
        connection: this.redisConfig 
      });
    }
    return this.queues[queueName];
  }

  async addJob(queueName, jobName, data) {
    const queue = this.getQueue(queueName);
    return await queue.add(jobName, data, { 
        removeOnComplete: true, 
        attempts: 3,        
        backoff: { type: 'exponential', delay: 1000 } 
    });
  }

  async close() {
    await Promise.all(this.workers.map(worker => worker.close()));
    
    await Promise.all(Object.values(this.queues).map(queue => queue.close()));
    
    console.log('[JobQueue] All queues and workers closed gracefully.');
  }

  registerWorker(queueName, processor) {
    const worker = new Worker(queueName, processor, { 
      connection: this.redisConfig 
    });
    
    worker.on('completed', (job) => {
      console.log(`[JobQueue] Job ${job.name} in ${queueName} completed!`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[JobQueue] Job ${job.name} failed: ${err.message}`);
    });

    this.workers.push(worker);
    console.log(`[JobQueue] Worker registered for: ${queueName}`);
  }
}

export default JobQueue;