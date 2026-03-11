import { getContainer } from '../../container/index.js';

export const initFollowWorkers = () => {
  try {
    const container = getContainer();
    
    const jobQueue = container.resolve('jobQueue');
    const followProcessor = container.resolve('followProcessor');

    jobQueue.registerWorker('follow-updates', followProcessor.getProcessor());
    
    console.log('[Worker] Follow workers initialized successfully.');
  } catch (error) {
    console.error('[CRITICAL][Worker] Failed to initialize Follow workers:', error.message);
  }
};