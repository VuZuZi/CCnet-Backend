import { getContainer } from '../../container/index.js';

class UserProcessor {
    getProcessor() {
        return async (job) => {
            const { type } = job.data;

            if (job.name === 'daily-kyc-check' || type === 'daily-kyc-check') {
                const container = getContainer();
                const kycMaintenanceService = container.resolve('kycMaintenanceService');
                await kycMaintenanceService.processDailyKycChecks();
            }
        };
    }
}

export default UserProcessor;