import AppError from './AppError.js';


export const withOptimisticRetry = async (operation, maxRetries = 3, baseDelayMs = 50) => {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            if (error.name === 'VersionError' || error.code === 11000) {
                attempts++;
                if (attempts >= maxRetries) {
                    throw new AppError('Hệ thống đang xử lý quá nhiều giao dịch đồng thời trên tài nguyên này. Vui lòng thử lại sau vài giây.', 409);
                }
                const delay = baseDelayMs * Math.pow(2, attempts - 1) + Math.random() * 20;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
};