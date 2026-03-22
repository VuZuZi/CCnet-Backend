import { getContainer } from '../../container/index.js';

export const initVolunteerWorkers = () => {
  console.log('🚀 Starting Volunteer Workers...');


  try {
    const container = getContainer();
    const jobQueue = container.resolve('jobQueue');
    const volunteerProcessor = container.resolve('volunteerProcessor');
    jobQueue.registerWorker('volunteer-updates', volunteerProcessor.getProcessor());

    console.log('[Worker] Volunteer workers initialized successfully.');
  } catch (error) {
    console.error('[CRITICAL][Worker] Failed to initialize Volunteer workers:', error.message);
  }
};