import AppError from '../core/AppError.js';
import { getContainer } from '../container/index.js';

export const requireKycTier = (minTier) => {
    return async (req, res, next) => {
        try {
            const container = getContainer();
            const userRepository = container.resolve('userRepository');

            const user = await userRepository.findById(req.user.userId);

            if (!user) {
                throw new AppError('Người dùng không tồn tại', 404);
            }

            const kyc = user.kyc || { tier: 0, status: 'UNVERIFIED' };

            if (kyc.status === 'EXPIRED') {
                throw new AppError('KYC của bạn đã hết hạn. Vui lòng cập nhật để tiếp tục.', 403);
            }

            if (kyc.status === 'LOCKED') {
                throw new AppError('Tài khoản của bạn đang bị khóa chức năng Organizer.', 403);
            }

            if (kyc.tier < minTier) {
                throw new AppError(`Yêu cầu KYC Tier ${minTier} trở lên để thực hiện hành động này. Tier hiện tại: ${kyc.tier}`, 403);
            }

            req.realtimeKyc = kyc;
            next();
        } catch (error) {
            next(error);
        }
    };
};

export const ensureKycActive = async (req, res, next) => {
    try {
        const container = getContainer();
        const userRepository = container.resolve('userRepository');

        const user = await userRepository.findById(req.user.userId);
        const kycStatus = user?.kyc?.status;

        if (kycStatus === 'EXPIRED' || kycStatus === 'LOCKED' || kycStatus === 'UNVERIFIED') {
            throw new AppError('Trạng thái xác minh hiện tại không cho phép thực hiện hành động này.', 403);
        }

        next();
    } catch (error) {
        next(error);
    }
};


export const ensureKycValidFor = (requiredValidDays = 0) => {
    return async (req, res, next) => {
        try {
            const container = getContainer();
            const userRepository = container.resolve('userRepository');

            const user = await userRepository.findById(req.user.userId);
            const kyc = user?.kyc;

            if (!kyc || kyc.status === 'UNVERIFIED' || kyc.status === 'LOCKED' || kyc.status === 'EXPIRED') {
                throw new AppError('Trạng thái xác minh hiện tại không cho phép thực hiện hành động này.', 403);
            }

            if (kyc.expiresAt) {
                const now = new Date();
                const daysRemaining = (new Date(kyc.expiresAt).getTime() - now.getTime()) / (1000 * 3600 * 24);

                if (daysRemaining < requiredValidDays) {
                    throw new AppError(
                        `KYC của bạn sẽ hết hạn sau ${Math.ceil(daysRemaining)} ngày. Yêu cầu còn hạn ít nhất ${requiredValidDays} ngày để thực hiện hành động này. Vui lòng gia hạn.`,
                        403
                    );
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};
