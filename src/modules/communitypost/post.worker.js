import { getContainer } from '../../container/index.js';

export const processUserUpdate = async (job) => {
  const { userId, fullName, avatar, username } = job.data;

  console.log(`[Worker] Starting job ${job.name}: Syncing profile for user ${userId}...`);

  try {
    const container = getContainer();
    const maintenanceService = container.resolve('postMaintenanceService'); 

    const result = await maintenanceService.syncUserProfileToPosts(userId, { fullName, avatar, username });

    console.log(`[Worker] Job ${job.name} completed. Posts: ${result.processedPosts}, Comments: ${result.processedComments}`);
    return { success: true, userId, meta: result };
  } catch (error) {
    console.error(`[Worker] [CRITICAL] Job ${job.name} failed for user ${userId}. Reason:`, error.message);
    throw error; 
  }
};

export const initPostWorkers = () => {
  try {
    const container = getContainer();
    const jobQueue = container.resolve('jobQueue'); 
    
    // Ở hệ thống Enterprise, Worker cần giới hạn Concurrency để không ăn sạch RAM
    // Giả định jobQueue của bạn hỗ trợ tham số options
    jobQueue.registerWorker('user-updates', processUserUpdate, {
       concurrency: 2, // Chỉ cho phép chạy song song 2 luồng đồng bộ DB lớn
       attempts: 3,    // Thử lại tối đa 3 lần nếu có Transient Error
       backoff: { type: 'exponential', delay: 5000 }
    });

    console.log('[Worker] Post workers initialized and listening on queue: user-updates');
  } catch (error) {
    console.error('[Worker] Failed to initialize Post workers:', error);
    process.exit(1); // Fail Fast: Nếu worker không khởi tạo được, sập luôn app để DevOps biết mà sửa. Không chạy ngầm im lặng.
  }
};