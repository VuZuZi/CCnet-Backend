import AppError from '../../../core/AppError.js';
import { PROJECT_STATUS, PROJECT_TYPE } from '../project.constant.js';

class ProjectCompletionService {
    constructor({
        projectRepository,
        escrowRepository,
        transactionRepository,
        walletRepository,
        systemFinancialRepository,
        transactionManager,
        eventBus,
        config
    }) {
        this.projectRepository = projectRepository;
        this.escrowRepository = escrowRepository;
        this.transactionRepository = transactionRepository;
        this.walletRepository = walletRepository;
        this.systemFinancialRepository = systemFinancialRepository;
        this.transactionManager = transactionManager;
        this.eventBus = eventBus;
        this.config = config;
    }

    async executeSurplusWaterfall(projectId) {
        const project = await this.projectRepository.findById(projectId);

        if (!project) throw new AppError('Dự án không tồn tại', 404);

        if (project.projectType !== PROJECT_TYPE.FUNDED) {
            return { skipped: true, reason: 'Dự án tình nguyện không có luồng tiền' };
        }

        if (![PROJECT_STATUS.COMPLETED_SUCCESSFULLY, PROJECT_STATUS.COMPLETED_PARTIAL].includes(project.status)) {
            throw new AppError('Dự án chưa được nghiệm thu hoàn tất', 400);
        }

        const escrow = await this.escrowRepository.findByProjectId(projectId);
        const totalSurplus = escrow?.availableBalance || 0;

        if (totalSurplus <= 0) {
            return { skipped: true, reason: 'Quỹ tín thác không có tiền dư' };
        }

        const donorList = await this.transactionRepository.getDonorContributionSummary(projectId);
        const totalValidPool = donorList.reduce((sum, d) => sum + d.totalNetDonated, 0);

        const DUST_THRESHOLD = this.config?.surplus?.dustThreshold || 10000;

        let charityPool = 0;
        let totalWalletRefunds = 0;
        const walletUpdates = [];
        const transactionInserts = [];

        if (totalValidPool === 0) {
            charityPool = totalSurplus;
        } else {
            for (const donor of donorList) {
                const ratio = donor.totalNetDonated / totalValidPool;
                const exactShare = ratio * totalSurplus;
                const roundedShare = Math.floor(exactShare);

                if (!donor.donorId) {
                    charityPool += roundedShare;
                    continue;
                }

                if (roundedShare < DUST_THRESHOLD) {
                    charityPool += roundedShare;
                }
                else {
                    walletUpdates.push({ userId: donor.donorId, amount: roundedShare });
                    transactionInserts.push({
                        type: 'SURPLUS_REFUND',
                        amount: roundedShare,
                        grossAmount: roundedShare,
                        netAmount: roundedShare,
                        platformFee: 0,
                        projectId: projectId,
                        donorRef: donor.donorId,
                        status: 'COMPLETED',
                        message: 'Hoàn trả phần trăm tiền thừa dự án vào ví'
                    });
                    totalWalletRefunds += roundedShare;
                }
            }

            const remainder = totalSurplus - totalWalletRefunds - charityPool;
            if (remainder > 0) {
                charityPool += remainder;
            }
        }

        const settlementSummary = {
            totalSurplus,
            walletRefundsAmount: totalWalletRefunds,
            charitySweepAmount: charityPool,
            walletCount: walletUpdates.length,
            completedAt: new Date()
        };

        await this.transactionManager.runInTransaction(async (session) => {
            await this.escrowRepository.sweepSurplus(projectId, totalSurplus, session);

            if (walletUpdates.length > 0) {
                await this.walletRepository.bulkUpdateBalances(walletUpdates, session);
                await this.transactionRepository.bulkInsert(transactionInserts, session);
            }

            if (charityPool > 0) {
                await this.systemFinancialRepository.incrementCharityFund(charityPool, session);
                await this.transactionRepository.create({
                    type: 'SURPLUS_DONATE_TO_PLATFORM',
                    amount: charityPool,
                    projectId,
                    status: 'COMPLETED',
                    message: 'Gom tiền lẻ/tiền thừa dự án vào Quỹ Từ Thiện Chung'
                }, session);
            }

            await this.projectRepository.updateById(projectId, {
                postProjectSummary: settlementSummary
            }, session);
        });

        if (this.eventBus) {
            this.eventBus.emit('SURPLUS_DISTRIBUTED', {
                projectId,
                totalSurplus,
                totalRefundedToWallets: totalWalletRefunds,
                totalSweptToCharity: charityPool,
                refundedUserCount: walletUpdates.length
            });
        }

        return {
            success: true,
            ...settlementSummary
        };
    }
}

export default ProjectCompletionService;