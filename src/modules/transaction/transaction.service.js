import AppError from "../../core/AppError.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";
import { PROJECT_STATUS } from "../project/project.constant.js";
import { USER_REFUND_POLICY } from "./transaction.constant.js";

class TransactionService {
    constructor({
        transactionRepository,
        escrowRepository,
        projectRepository,
        paymentProvider,
        transactionManager,
        redis,
        eventBus,
        userRepository,
        walletRepository,
        bankAccountRepository
    }) {
        this.transactionRepository = transactionRepository;
        this.escrowRepository = escrowRepository;
        this.projectRepository = projectRepository;
        this.paymentProvider = paymentProvider;
        this.transactionManager = transactionManager;
        this.redis = redis;
        this.eventBus = eventBus;
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.bankAccountRepository = bankAccountRepository;
    }

    _checkFundingConstraints(project) {
        if (project.status !== PROJECT_STATUS.FUNDING) {
            throw new AppError("Dự án hiện không trong giai đoạn nhận tài trợ", 400);
        }

        if (project.endDate && new Date() > new Date(project.endDate)) {
            throw new AppError("Dự án đã kết thúc thời gian nhận tài trợ", 400);
        }

        if (project.targetAmount > 0) {
            const hardCapAmount = project.targetAmount * 1.1;
            if (project.currentAmount >= hardCapAmount) {
                throw new AppError("Dự án đã đạt giới hạn gọi vốn tối đa (110% mục tiêu). Không thể nhận thêm.", 400);
            }
        }
    }

    async initiateDonation(donorId, payload) {
        const { projectId, amount, paymentMethod, cancelUrl, returnUrl } = payload;

        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError("Không tìm thấy dự án", 404);

        this._checkFundingConstraints(project);

        if (paymentMethod === 'WALLET') {
            const wallet = await this.walletRepository.findByUserId(donorId);
            if (wallet.balance < amount) {
                throw new AppError(`Số dư ví không đủ. Hiện tại: ${wallet.balance.toLocaleString()} VNĐ`, 400);
            }

            const result = await this.transactionManager.runInTransaction(async (session) => {
                const updatedWallet = await this.walletRepository.incrementBalance(donorId, -amount, session);

                const transaction = await this.transactionRepository.create({
                    type: 'DONATION_FROM_WALLET',
                    amount,
                    projectId,
                    donorRef: donorId,
                    status: 'COMPLETED'
                }, session);

                const updatedEscrow = await this.escrowRepository.incrementBalance(projectId, amount, session);
                const updatedProject = await this.projectRepository.incrementFunding(projectId, amount, session);

                let isHardCapped = false;
                if (updatedProject.targetAmount > 0) {
                    const currentPercentage = (updatedProject.currentAmount / updatedProject.targetAmount) * 100;
                    if (currentPercentage >= 110 && updatedProject.status === PROJECT_STATUS.FUNDING) {
                        await this.projectRepository.transitionStatus(updatedProject._id, PROJECT_STATUS.FUNDING, PROJECT_STATUS.EXECUTING, session);
                        isHardCapped = true;
                    }
                }

                return { tx: transaction, escrow: updatedEscrow, project: updatedProject, isHardCapped };
            });

            if (this.eventBus) {
                const donor = await this.userRepository.findById(donorId);
                const donorName = donor ? (donor.fullName || "Nhà hảo tâm") : "Nhà hảo tâm ẩn danh";

                this.eventBus.emit(DOMAIN_EVENTS.DONATION_SUCCESSFUL, {
                    transactionId: String(result.tx._id),
                    projectId: String(result.tx.projectId),
                    projectName: result.project.title,
                    organizerId: String(result.project.organizerId),
                    donorId: String(donorId),
                    donorName: donorName,
                    amount: amount,
                    currentEscrowBalance: result.escrow.availableBalance
                });

                if (result.isHardCapped) {
                    this.eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
                        recipientIds: [String(result.project.organizerId)],
                        actorId: "system",
                        projectId: result.project._id,
                        status: PROJECT_STATUS.EXECUTING,
                        title: "Dự án đã đóng gọi vốn (Đạt 110%)"
                    });
                }
            }

            return {
                transactionId: result.tx._id,
                paymentMethod: 'WALLET',
                status: 'COMPLETED',
                message: 'Thanh toán qua ví thành công'
            };
        }

        const redisClient = this.redis.getClient();
        const orderCodeInt = await redisClient.incr('transaction:seq:payos_order_code');

        const transaction = await this.transactionRepository.create({
            type: 'DONATION',
            amount,
            projectId,
            donorRef: donorId,
            gatewayTransactionId: String(orderCodeInt),
            status: 'PENDING'
        });

        const paymentLink = await this.paymentProvider.createPaymentLink({
            orderCode: orderCodeInt,
            amount,
            description: `Ủng hộ ${project.title.substring(0, 15)}...`,
            cancelUrl,
            returnUrl
        });

        return {
            transactionId: transaction._id,
            checkoutUrl: paymentLink.checkoutUrl,
            qrCode: paymentLink.qrCode,
            paymentMethod: 'PAYOS'
        };
    }

async handlePayosWebhook(webhookBody) {
        const verifiedData = this.paymentProvider.verifyWebhookData(webhookBody);
        
        const orderCode = verifiedData?.orderCode || webhookBody.data?.orderCode;
        const amount = verifiedData?.amount || webhookBody.data?.amount;
        const success = webhookBody.success !== undefined ? webhookBody.success : verifiedData?.success;
        const code = webhookBody.code || verifiedData?.code;

        if (!orderCode) {
            console.error("[CRITICAL] PayOS Webhook Payload bất thường, không tìm thấy orderCode:", webhookBody);
            return { status: 'invalid_payload' };
        }

        if (success === false || code !== "00") {
            const failedTx = await this.transactionRepository.updateStatusIfPending(String(orderCode), 'FAILED', {
                gatewayResponse: webhookBody
            });
            
            if (failedTx && this.eventBus) {
                this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_FAILED, {
                    userId: failedTx.donorRef ? String(failedTx.donorRef) : null,
                    transactionId: String(failedTx._id),
                    amount: failedTx.amount
                });
            }
            return { status: 'processed_failed' };
        }

        let isHardCapped = false;

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const updatedTx = await this.transactionRepository.updateStatusIfPending(
                String(orderCode),
                'COMPLETED',
                { gatewayResponse: webhookBody },
                session
            );

            if (!updatedTx) {
                return { status: 'ignored_idempotent' };
            }

            const updatedEscrow = await this.escrowRepository.incrementBalance(updatedTx.projectId, amount, session);
            const updatedProject = await this.projectRepository.incrementFunding(updatedTx.projectId, amount, session);

            if (updatedProject.targetAmount > 0) {
                const currentPercentage = (updatedProject.currentAmount / updatedProject.targetAmount) * 100;
                if (currentPercentage >= 110 && updatedProject.status === PROJECT_STATUS.FUNDING) {
                    await this.projectRepository.transitionStatus(updatedProject._id, PROJECT_STATUS.FUNDING, PROJECT_STATUS.EXECUTING, session);
                    isHardCapped = true;
                    updatedProject.status = PROJECT_STATUS.EXECUTING;
                }
            }

            return { tx: updatedTx, escrow: updatedEscrow, project: updatedProject, status: 'success' };
        });

        if (result.status === 'success' && this.eventBus) {
            try {
                let donorName = "Nhà hảo tâm ẩn danh";
                if (result.tx.donorRef) {
                    const donor = await this.userRepository.findById(result.tx.donorRef);
                    if (donor) donorName = donor.fullName || donor.username || "Nhà hảo tâm";
                }

                this.eventBus.emit(DOMAIN_EVENTS.DONATION_SUCCESSFUL, {
                    transactionId: String(result.tx._id),
                    projectId: String(result.tx.projectId),
                    projectName: result.project?.title || "Dự án",
                    organizerId: result.project?.organizerId ? String(result.project.organizerId) : null,
                    donorId: result.tx.donorRef ? String(result.tx.donorRef) : null,
                    donorName: donorName,
                    amount: result.tx.amount,
                    currentEscrowBalance: result.escrow.availableBalance
                });

            } catch (enrichError) {
                this.eventBus.emit(DOMAIN_EVENTS.DONATION_SUCCESSFUL, {
                    transactionId: String(result.tx._id),
                    projectId: String(result.tx.projectId),
                    donorId: result.tx.donorRef ? String(result.tx.donorRef) : null,
                    amount: result.tx.amount,
                    currentEscrowBalance: result.escrow.availableBalance
                });
            }
        }

        return result;
    }

    async processAutoRefundToWallet(projectId) {
        const donations = await this.transactionRepository.findCompletedDonationsByProject(projectId);
        
        if (!donations || donations.length === 0) return { success: true, processedCount: 0 };

        let processedCount = 0;

        for (const donation of donations) {
            try {
                const wasProcessed = await this.transactionManager.runInTransaction(async (session) => {
                    const lockedTx = await this.transactionRepository.reconcileDonationAtomic(donation._id, session);
                    if (!lockedTx) return false;

                    await this.transactionRepository.create({
                        type: 'WALLET_DEPOSIT',
                        amount: donation.amount,
                        projectId: donation.projectId,
                        donorRef: donation.donorRef,
                        status: 'COMPLETED'
                    }, session);

                    await this.walletRepository.incrementBalance(donation.donorRef, donation.amount, session);
                    await this.escrowRepository.recordRefund(donation.projectId, donation.amount, session);
                    return true;
                });

                if (wasProcessed) {
                    processedCount++;
                    if (this.eventBus && donation.donorRef) {
                        this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_REFUNDED, {
                            userId: String(donation.donorRef),
                            transactionId: String(donation._id),
                            amount: donation.amount,
                            isAutoRefund: true
                        });
                    }
                }

            } catch (error) {
                console.error(`[Auto-Refund] [CRITICAL] Lỗi hoàn tiền cho TX ${donation._id}:`, error.message);
            }
        }

        return { success: true, processedCount };
    }

    async processUserRefundRequest(userId, transactionId) {
        const tx = await this.transactionRepository.findById(transactionId);
        
        if (!tx || !tx.donorRef.equals(userId)) {
            throw new AppError("Giao dịch không hợp lệ hoặc không thuộc về bạn.", 403);
        }
        if (!['DONATION', 'DONATION_FROM_WALLET'].includes(tx.type) || tx.status !== 'COMPLETED') {
            throw new AppError("Chỉ có thể hoàn tiền cho các giao dịch ủng hộ đã thành công.", 400);
        }
        if (tx.reconciled) {
            throw new AppError("Giao dịch này đã được xử lý hoàn tiền hoặc đối soát.", 400);
        }

        const hoursSince = (Date.now() - new Date(tx.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince > USER_REFUND_POLICY.ALLOWED_HOURS) {
            throw new AppError(`Đã quá ${USER_REFUND_POLICY.ALLOWED_HOURS} giờ. Không thể hoàn tiền.`, 400);
        }

        const project = await this.projectRepository.findById(tx.projectId);
        if (project.status === PROJECT_STATUS.COMPLETED || project.status === PROJECT_STATUS.EXECUTING) {
            throw new AppError("Dự án đã kết thúc gọi vốn hoặc đã giải ngân. Không thể hoàn tiền.", 400);
        }

        const originalAmount = tx.amount;
        const penaltyFee = USER_REFUND_POLICY.FIXED_FEE + Math.round(originalAmount * USER_REFUND_POLICY.PERCENTAGE_FEE);
        const refundAmount = originalAmount - penaltyFee;

        if (refundAmount <= 0) {
            throw new AppError("Số tiền hoàn trả quá nhỏ, không đủ để chi trả phí nền tảng.", 400);
        }

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const lockedTx = await this.transactionRepository.reconcileDonationAtomic(tx._id, session);
            if (!lockedTx) throw new AppError("Giao dịch đang được xử lý bởi hệ thống khác.", 409);

            await this.transactionRepository.create({
                type: 'USER_REFUND_REQUEST',
                amount: refundAmount,
                projectId: tx.projectId,
                donorRef: userId,
                status: 'COMPLETED'
            }, session);

            if (penaltyFee > 0) {
                await this.transactionRepository.create({
                    type: 'PLATFORM_FEE',
                    amount: penaltyFee,
                    projectId: tx.projectId,
                    donorRef: userId,
                    status: 'COMPLETED'
                }, session);
            }

            await this.projectRepository.incrementFunding(tx.projectId, -originalAmount, session);
            await this.escrowRepository.processUserRefundWithFee(tx.projectId, originalAmount, refundAmount, penaltyFee, session);
            const updatedWallet = await this.walletRepository.incrementBalance(userId, refundAmount, session);

            return { refundAmount, penaltyFee, newWalletBalance: updatedWallet.balance };
        });

        if (this.eventBus) {
            this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_REFUNDED, {
                userId: String(userId),
                transactionId: String(tx._id),
                amount: refundAmount,
                isAutoRefund: false
            });
        }

        return result;
    }

    async processWalletWithdrawal(userId, payload) {
        const { amount, bankAccountId } = payload;

        const bankAccount = await this.bankAccountRepository.findById(bankAccountId);
        if (!bankAccount || !bankAccount.userId.equals(userId)) {
            throw new AppError("Tài khoản ngân hàng không hợp lệ.", 403);
        }
        if (!bankAccount.isVerified || bankAccount.status !== 'ACTIVE') {
            throw new AppError("Tài khoản ngân hàng chưa được xác thực hoặc đang bị khóa.", 400);
        }

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const updatedWallet = await this.walletRepository.incrementBalance(userId, -amount, session).catch(err => {
                if (err.name === 'ValidationError') throw new AppError(`Số dư ví không đủ để rút.`, 400);
                throw err;
            });

            const withdrawalTx = await this.transactionRepository.create({
                type: 'WALLET_WITHDRAWAL',
                amount: amount,
                projectId: null,
                donorRef: userId,
                status: 'PENDING',
                gatewayResponse: {
                    bankName: bankAccount.bankName,
                    accountNumber: bankAccount.accountNumber,
                    accountName: bankAccount.accountName,
                    requestedAt: new Date().toISOString()
                }
            }, session);

            return {
                withdrawalId: withdrawalTx._id,
                status: 'PENDING',
                amountRequested: amount,
                remainingBalance: updatedWallet.balance
            };
        });

        if (this.eventBus) {
            this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_WITHDRAWAL_REQUESTED, {
                userId: String(userId),
                transactionId: String(result.withdrawalId),
                amount: amount
            });
        }

        return result;
    }
}

export default TransactionService;