import { getContainer } from '../../container/index.js';

export const initUserWorkers = () => {
    const container = getContainer();
    const jobQueue = container.resolve('jobQueue');
    const userProcessor = container.resolve('userProcessor');

    jobQueue.registerWorker('user-maintenance', userProcessor.getProcessor());

    jobQueue.addJob(
        'user-maintenance',
        'daily-kyc-check',
        { type: 'daily-kyc-check' },
        {
            repeat: { cron: '0 0 * * *' },
            jobId: 'singleton-daily-kyc-check'
        }
    ).catch(err => console.error('[Worker] Khởi tạo KYC Cronjob thất bại:', err.message));

    console.log('[Worker] User Maintenance (KYC) Worker initialized.');
};