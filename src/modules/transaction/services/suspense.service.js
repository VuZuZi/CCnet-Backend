import AppError from "../../../core/AppError.js";
import { DOMAIN_EVENTS } from "../../../config/notification.js";

class SuspenseService {
    constructor({
        redis,
        suspenseTransactionRepository,
        transactionRepository,
        transactionManager,
        paymentProvider,
        eventBus,
        escrowRepository,
        projectRepository,
        systemFinancialRepository,
        walletRepository,
        config
    }) {
        this.redis = redis;
        this.suspenseTransactionRepository = suspenseTransactionRepository;
        this.transactionRepository = transactionRepository;
        this.transactionManager = transactionManager;
        this.paymentProvider = paymentProvider;
        this.eventBus = eventBus;
        this.escrowRepository = escrowRepository;
        this.projectRepository = projectRepository;
        this.systemFinancialRepository = systemFinancialRepository;
        this.walletRepository = walletRepository;
        this.config = config;
    }

    async recordSuspense(amount, bankRef, content) {
        console.warn(`[SmartRouter] Giao dịch rơi vào SUSPENSE. BankRef: ${bankRef}, Tiền: ${amount}`);

        const suspenseTx = await this.suspenseTransactionRepository.create({
            amount: amount,
            bankTransactionRef: bankRef,
            description: content || 'Không có nội dung',
            receivedAt: new Date(),
            status: 'UNALLOCATED'
        });

        if (this.eventBus) {
            this.eventBus.emit('SYSTEM_ALERT', {
                level: 'INFO',
                type: 'NEW_SUSPENSE_TRANSACTION',
                message: `Có khoản tiền mồ côi mới: ${amount.toLocaleString()} VNĐ. BankRef: ${bankRef}. Vui lòng chờ người dùng tra soát.`
            });
        }

        return { status: 'suspense_recorded', suspenseId: suspenseTx._id };
    }

    async _scanSePayForMissingRef(bankRef) {
        for (let i = 0; i < 3; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() - i);

            const list = await this.paymentProvider.fetchTransactionsList(checkDate);
            if (!list || list.length === 0) continue;

            const matched = list.find(tx =>
                String(tx.reference_number || tx.referenceCode) === String(bankRef) &&
                (tx.transferType === 'in' || Number(tx.amount_in) > 0)
            );

            if (matched) return matched;
        }
        return null;
    }

    async submitClaimRequest(userId, payload) {
        const { amount, bankTransactionRef, proofImageUrl } = payload;

        const redisClient = this.redis.getClient();
        const rateKey = `rate:claim:${userId}`;
        const currentRequests = await redisClient.incr(rateKey);

        if (currentRequests === 1) await redisClient.expire(rateKey, 3600);

        if (currentRequests > 5) {
            throw new AppError("Bạn đã thực hiện quá nhiều thao tác tra soát. Vui lòng thử lại sau 1 giờ.", 429);
        }

        const pendingCount = await this.suspenseTransactionRepository.countPendingClaimsByUser(userId);
        if (pendingCount >= 3) {
            throw new AppError("Bạn đang có 3 yêu cầu tra soát chờ xử lý. Vui lòng đợi duyệt các yêu cầu cũ.", 400);
        }

        if (!bankTransactionRef) {
            throw new AppError("BẮT BUỘC phải cung cấp Mã giao dịch/Mã tham chiếu từ biên lai ngân hàng.", 400);
        }

        const existingTx = await this.transactionRepository.findByBankTransactionRef(bankTransactionRef);
        if (existingTx && existingTx.status === 'COMPLETED') {
            throw new AppError("Giao dịch này đã được ghi nhận tự động thành công. Không cần tra soát.", 400);
        }

        let candidates = await this.suspenseTransactionRepository.findCandidateForClaim(amount, bankTransactionRef);

        if (candidates.length === 0) {
            console.log(`[On-Demand Sync] Kích hoạt rà soát SePay API cho mã: ${bankTransactionRef}`);
            const foundSePayTx = await this._scanSePayForMissingRef(bankTransactionRef);

            if (!foundSePayTx) {
                throw new AppError("Khoản tiền chưa vào hệ thống ngân hàng hoặc sai Mã tham chiếu. Xin thử lại sau 30 phút.", 404);
            }

            const actualAmount = Number(foundSePayTx.transferAmount || foundSePayTx.amount_in);
            if (actualAmount !== amount) {
                throw new AppError(`Tra soát thất bại: Số tiền bạn nhập (${amount}đ) không khớp với biên lai (${actualAmount}đ).`, 400);
            }

            const suspenseTx = await this.suspenseTransactionRepository.create({
                amount: actualAmount,
                bankTransactionRef: bankTransactionRef,
                description: (foundSePayTx.transaction_content || foundSePayTx.content || 'Khôi phục Webhook qua Tra soát On-Demand').substring(0, 500),
                receivedAt: foundSePayTx.transaction_date ? new Date(foundSePayTx.transaction_date) : new Date(),
                status: 'UNALLOCATED'
            });

            candidates = [suspenseTx];
        }

        const suspense = candidates[0];
        const suspenseId = suspense._id;

        const hasPending = suspense.claimRequests?.some(r => String(r.userId) === String(userId) && r.status === 'PENDING');
        if (hasPending) throw new AppError("Bạn đã nộp biên lai tra soát cho giao dịch này rồi.", 400);

        await this.suspenseTransactionRepository.addClaimRequest(suspenseId, {
            userId,
            proofImageUrl,
            status: 'PENDING'
        });

        if (this.eventBus) {
            this.eventBus.emit('SYSTEM_ALERT', {
                level: 'INFO',
                type: 'NEW_CLAIM_REQUEST',
                message: `Có yêu cầu tra soát mới từ user ${userId} cho số tiền ${amount.toLocaleString()} VNĐ. BankRef: ${bankTransactionRef}`
            });
        }

        return { message: "Đã nộp biên lai thành công. Hệ thống đang đối soát.", suspenseId };
    }

    _checkFundingEligibility(project) {
        if (!project) return false;
        if (project.status !== 'FUNDING') return false;
        if (project.endDate && new Date() > new Date(project.endDate)) return false;
        if (project.targetAmount > 0 && project.currentAmount >= (project.targetAmount * 1.1)) return false;
        return true;
    }

    async approveClaimRequest(adminId, payload) {
        const { suspenseId, claimRequestId, projectId } = payload;

        const suspense = await this.suspenseTransactionRepository.findById(suspenseId);
        if (!suspense) throw new AppError("Giao dịch treo không tồn tại", 404);
        if (suspense.status !== 'UNALLOCATED') throw new AppError(`Giao dịch này đã được phân bổ (${suspense.status})`, 400);

        const claimInfo = suspense.claimRequests?.find(r => String(r._id) === String(claimRequestId));
        if (!claimInfo || claimInfo.status !== 'PENDING') throw new AppError("Yêu cầu tra soát không tồn tại hoặc đã xử lý", 400);

        const project = await this.projectRepository.findById(projectId);
        const isEligible = this._checkFundingEligibility(project);

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const updatedSuspense = await this.suspenseTransactionRepository.allocateIfUnallocated(
                suspenseId, claimRequestId,
                { resolvedBy: adminId, resolvedAt: new Date(), targetProjectId: projectId },
                session
            );

            if (!updatedSuspense) throw new AppError("Xung đột dữ liệu: Yêu cầu này vừa được Quản trị viên khác duyệt.", 409);

            if (isEligible) {
                const newTx = await this.transactionRepository.create({
                    type: 'DONATION',
                    amount: suspense.amount,
                    grossAmount: suspense.amount,
                    netAmount: suspense.amount,
                    platformFee: 0,
                    projectId: projectId,
                    donorRef: claimInfo.userId,
                    bankTransactionRef: suspense.bankTransactionRef,
                    status: 'COMPLETED',
                    message: "Được khôi phục thông qua hệ thống Tra soát Admin"
                }, session);

                await this.escrowRepository.incrementBalance(projectId, suspense.amount, session);
                await this.projectRepository.incrementFunding(projectId, suspense.amount, session);

                return { tx: newTx, flow: 'ESCROW_FUNDED', netAmount: suspense.amount };
            } else {
                const refundTx = await this.transactionRepository.create({
                    type: 'WALLET_DEPOSIT',
                    amount: suspense.amount,
                    grossAmount: suspense.amount,
                    netAmount: suspense.amount,
                    platformFee: 0,
                    projectId: projectId,
                    donorRef: claimInfo.userId,
                    bankTransactionRef: suspense.bankTransactionRef,
                    status: 'COMPLETED',
                    message: "Dự án đã kết thúc hoặc vượt mốc 110%. Tiền tra soát tự động hoàn vào Ví."
                }, session);

                await this.walletRepository.incrementBalance(claimInfo.userId, suspense.amount, session);

                return { tx: refundTx, flow: 'REFUNDED_TO_WALLET', netAmount: suspense.amount };
            }
        });

        // Bắn Event Notify
        if (this.eventBus) {
            const eventPayload = {
                transactionId: String(result.tx._id),
                projectId: String(projectId),
                donorId: String(claimInfo.userId),
                amount: result.netAmount,
                isClaimRecovery: true
            };

            if (result.flow === 'REFUNDED_TO_WALLET') {
                this.eventBus.emit('TRANSACTION_REFUNDED', eventPayload);
            } else {
                this.eventBus.emit('DONATION_SUCCESSFUL', eventPayload);
            }
        }

        return {
            message: result.flow === 'ESCROW_FUNDED' ? "Phân bổ tiền vào dự án thành công" : "Dự án không còn nhận vốn. Tiền đã được hoàn vào Ví User.",
            transactionId: result.tx._id
        };
    }

    async getSuspenseList(query) {
        const page = parseInt(query?.page, 10) || 1;
        const limit = parseInt(query?.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const { items, total } = await this.suspenseTransactionRepository.findSuspenseList({
            status: query.status,
            hasClaim: query.hasClaim,
            skip,
            limit
        });

        return {
            items,
            pagination: {
                totalItems: total,
                currentPage: page,
                totalPages: Math.ceil(total / limit) || 1,
                hasNextPage: page * limit < total
            }
        };
    }

    async syncMissingTransactions(date = new Date()) {
        const bankTransactions = await this.paymentProvider.fetchTransactionsList(date);
        if (!bankTransactions || bankTransactions.length === 0) return { processed: 0, recovered: 0 };

        const incomingTxs = bankTransactions.filter(tx =>
            tx.transferType === 'in' || (tx.amount_in && Number(tx.amount_in) > 0)
        );

        if (incomingTxs.length === 0) return { processed: 0, recovered: 0 };

        const incomingRefsMap = new Map();
        incomingTxs.forEach(tx => {
            const bankRef = tx.reference_number || tx.referenceCode;
            if (bankRef) incomingRefsMap.set(String(bankRef), tx);
        });

        const redisClient = this.redis.getClient();
        let recoveredCount = 0;

        for (const [ref, tx] of incomingRefsMap.entries()) {
            const lockKey = `lock:webhook:${ref}`;

            const acquired = await redisClient.set(lockKey, 'LOCKED', 'NX', 'EX', 30);
            if (!acquired) continue;

            try {
                const [txExists, suspenseExists] = await Promise.all([
                    this.transactionRepository.findByBankTransactionRef(ref),
                    this.suspenseTransactionRepository.findByBankTransactionRef(ref)
                ]);

                if (!txExists && !suspenseExists) {
                    await this.suspenseTransactionRepository.create({
                        amount: Number(tx.amount_in || tx.transferAmount),
                        bankTransactionRef: ref,
                        description: (tx.transaction_content || tx.content || 'Giao dịch rớt Webhook (Auto-Recovered)').substring(0, 500),
                        receivedAt: tx.transaction_date ? new Date(tx.transaction_date) : new Date(),
                        status: 'UNALLOCATED'
                    });
                    recoveredCount++;
                }
            } finally {
                await redisClient.del(lockKey);
            }
        }

        if (recoveredCount > 0 && this.eventBus) {
            this.eventBus.emit('SYSTEM_ALERT', {
                level: 'WARNING',
                type: 'MISSING_TRANSACTION_RECOVERED',
                message: `Hệ thống tự động phục hồi ${recoveredCount} giao dịch rớt Webhook.`
            });
        }

        return { processed: incomingTxs.length, recovered: recoveredCount };
    }
}

export default SuspenseService;
