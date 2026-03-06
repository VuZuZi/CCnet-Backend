import { getContainer } from '../../container/index.js';

const processUserUpdate = async (job) => {
  const { userId, fullName, avatar, username } = job.data;

  console.log(`[Worker] Starting job ${job.name}: Syncing profile for user ${userId}...`);

  try {
    const container = getContainer();
    
    const maintenanceService = container.resolve('postMaintenanceService'); 

    const result = await maintenanceService.syncUserProfileToPosts(userId, { fullName, avatar, username });

    console.log(`[Worker] Job ${job.name} completed. Posts: ${result.processedPosts}, Comments: ${result.processedComments}`);
    return { success: true, userId, meta: result };
  } catch (error) {
    console.error(`[Worker] Job ${job.name} failed for user ${userId}:`, error);
    throw error; 
  }
};

export const initPostWorkers = () => {
  const container = getContainer();
  
  const jobQueue = container.resolve('jobQueue'); 
  
  jobQueue.registerWorker('user-updates', processUserUpdate);

  console.log('[Worker] Post workers initialized and listening on queue: user-updates');
};