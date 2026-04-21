import crypto from 'crypto';
import AppError from "../../../core/AppError.js";
import MoneyMath from "../../../core/MoneyMath.js";
import { DOMAIN_EVENTS } from "../../../config/notification.js";
import { PROJECT_STATUS, PROJECT_TYPE } from "../../project/project.constant.js";
import { USER_REFUND_POLICY } from "../transaction.constant.js";

class TransactionService {
    constructor({
        config,
        transactionRepository,
        suspenseTransactionRepository,
        systemFinancialRepository,
        escrowRepository,
        projectRepository,
        paymentProvider,
        transactionManager,
        suspenseService,
        redis,
        eventBus,
        userRepository,
        walletRepository,
        bankAccountRepository,
        dailyLedgerLogRepository,
        webhookAuditLogRepository
    }) {
        this.config = config;
        this.transactionRepository = transactionRepository;
        this.suspenseTransactionRepository = suspenseTransactionRepository;
        this.systemFinancialRepository = systemFinancialRepository;
        this.escrowRepository = escrowRepository;
        this.projectRepository = projectRepository;
        this.paymentProvider = paymentProvider;
        this.transactionManager = transactionManager;
        this.suspenseService = suspenseService;
        this.redis = redis;
        this.eventBus = eventBus;
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.bankAccountRepository = bankAccountRepository;
        this.dailyLedgerLogRepository = dailyLedgerLogRepository;
        this.webhookAuditLogRepository = webhookAuditLogRepository;
    }

    async getPublicProjectDisbursements(projectId, query) {
        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError("Không tìm thấy dự án", 404);
        if (project.projectType !== PROJECT_TYPE.FUNDED) throw new AppError("Dự án tình nguyện không có giao dịch giải ngân tài chính", 400);

        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const result = await this.transactionRepository.findPublicDisbursementsByProject(projectId, skip, limit);

        return {
            disbursements: result.transactions,
            pagination: { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) }
        };
    }

    _checkFundingConstraints(project, currentFundedAmount = null) {
        if (project.status !== PROJECT_STATUS.FUNDING) throw new AppError("Dự án hiện không trong giai đoạn nhận tài trợ", 400);
        if (project.endDate && new Date() > new Date(project.endDate)) throw new AppError("Dự án đã kết thúc thời gian nhận tài trợ", 400);

        const fundedAmount = currentFundedAmount !== null
            ? Number(currentFundedAmount || 0)
            : Number(project.currentAmount || 0);

        if (project.targetAmount > 0 && fundedAmount >= project.targetAmount) {
            throw new AppError("Dự án đã đạt mục tiêu gọi vốn. Không thể nhận thêm.", 400);
        }
    }

    _validateDonationAmountAgainstTarget(project, fundedAmount, amount) {
        const targetAmount = Number(project?.targetAmount || 0);
        if (targetAmount <= 0) return;

        const safeFundedAmount = Number(fundedAmount || 0);
        const remainingAmount = Math.max(targetAmount - safeFundedAmount, 0);

        if (remainingAmount <= 0) {
            throw new AppError("Dự án đã đạt mục tiêu gọi vốn. Không thể nhận thêm.", 400);
        }

        if (Number(amount || 0) > remainingAmount) {
            throw new AppError(`Số tiền quyên góp vượt quá phần còn thiếu (${remainingAmount.toLocaleString('vi-VN')}đ).`, 400);
        }
    }

    async initiateDonation(donorId, payload) {
        const { projectId, amount, paymentMethod, isAnonymous, message } = payload;
        const safeAmount = MoneyMath.toIntegerAmount(amount);

        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError("Không tìm thấy dự án", 404);

        const escrow = await this.escrowRepository.findByProjectId(projectId);
        const fundedAmount = Number(escrow?.availableBalance ?? project.currentAmount ?? 0);

        this._checkFundingConstraints(project, fundedAmount);
        this._validateDonationAmountAgainstTarget(project, fundedAmount, safeAmount);

        if (paymentMethod === 'WALLET') {
            const wallet = await this.walletRepository.findByUserId(donorId);
            if (wallet.balance < safeAmount) throw new AppError(`Số dư ví không đủ. Hiện tại: ${wallet.balance.toLocaleString()} VNĐ`, 400);

            const result = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
                await this.walletRepository.incrementBalance(donorId, -safeAmount, session);

                const transaction = await this.transactionRepository.create({
                    type: 'DONATION_FROM_WALLET', amount: safeAmount, grossAmount: safeAmount,
                    netAmount: safeAmount, platformFee: 0, projectId, donorRef: donorId,
                    status: 'COMPLETED', isAnonymous
                }, session);

                const updatedEscrow = await this.escrowRepository.incrementBalance(projectId, safeAmount, session);
                const updatedProject = await this.projectRepository.incrementFunding(projectId, safeAmount, session);

                let isHardCapped = false;
                if (updatedProject.targetAmount > 0) {
                    const currentPercentage = (updatedProject.currentAmount / updatedProject.targetAmount) * 100;
                    if (currentPercentage >= 110 && updatedProject.status === PROJECT_STATUS.FUNDING) {
                        await this.projectRepository.transitionStatus(updatedProject._id, PROJECT_STATUS.FUNDING, PROJECT_STATUS.EXECUTING, session);
                        isHardCapped = true;
                    }
                }

                let donorName = "Nhà hảo tâm ẩn danh";
                if (!isAnonymous) {
                    const donor = await this.userRepository.findById(donorId);
                    if (donor) donorName = donor.fullName || "Nhà hảo tâm";
                }

                dispatchEvent(DOMAIN_EVENTS.DONATION_SUCCESSFUL, {
                    transactionId: String(transaction._id), projectId: String(projectId), projectName: updatedProject.title,
                    organizerId: String(updatedProject.organizerId), donorId: String(donorId), donorName: donorName,
                    amount: safeAmount, currentEscrowBalance: updatedEscrow.availableBalance
                });

                return { tx: transaction, isHardCapped };
            });

            return { transactionId: result.tx._id, paymentMethod: 'WALLET', status: 'COMPLETED', message: 'Thanh toán qua ví thành công' };
        }

        const redisClient = this.redis.getClient();
        const now = new Date();
        const datePrefix = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        
        const redisKey = `sepay:${datePrefix}:seq`;
        const seq = await redisClient.incr(redisKey);
        if (seq === 1) await redisClient.expire(redisKey, 172800);

        const gatewayTransactionId = `${datePrefix}${String(seq).padStart(4, '0')}`;
        const feeRate = this.config?.platformFeePercent || 0.015;
        const { grossAmount, platformFee } = MoneyMath.calculateForward(safeAmount, feeRate);

        const transaction = await this.transactionRepository.create({
            type: 'DONATION', amount: safeAmount, grossAmount: grossAmount, netAmount: safeAmount,
            platformFee: platformFee, projectId, donorRef: donorId, gatewayTransactionId: gatewayTransactionId,
            status: 'PENDING', isAnonymous, message
        });

        const transferMemo = `SEVQR DONATE ${gatewayTransactionId}`;
        const paymentData = await this.paymentProvider.createPaymentLink({ orderCode: gatewayTransactionId, amount: grossAmount, description: transferMemo });

        return {
            transactionId: transaction._id, paymentLinkId: paymentData.paymentLinkId, qrCode: paymentData.qrCode,
            transferMemo: paymentData.transferMemo, paymentMethod: 'BANK_TRANSFER',
            breakdown: { baseAmount: safeAmount, fee: platformFee, totalRequired: grossAmount }
        };
    }

    async handleSepayWebhook(headers, webhookBody) {
        const auditLog = await this.webhookAuditLogRepository.createLog({
            provider: 'SEPAY', rawPayload: webhookBody, headers: headers, status: 'RECEIVED'
        });

        try {
            const verifiedData = this.paymentProvider.verifyWebhookData(headers, webhookBody);
            
            // --- BẮT MẠCH INBOUND / OUTBOUND ---
            const isOutbound = verifiedData.transferType === 'out' || Number(verifiedData.amount_out) > 0;
            const transferAmount = MoneyMath.toIntegerAmount(
                isOutbound ? (verifiedData.amount_out || verifiedData.transferAmount || 0) 
                           : (verifiedData.amount_in || verifiedData.transferAmount || 0)
            );
            
            const bankRef = String(verifiedData.referenceCode || verifiedData.id || '');
            const content = String(verifiedData.content || verifiedData.transaction_content || '').toUpperCase();

            await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'RECEIVED', { bankTransactionRef: bankRef });

            const redisClient = this.redis.getClient();
            const lockKey = `webhook:${bankRef}:lock`;
            const lockValue = crypto.randomBytes(16).toString('hex');
            
            const acquired = await redisClient.set(lockKey, lockValue, 'NX', 'PX', 30000);

            if (!acquired) {
                await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'FAILED', { errorMessage: 'Concurrent processing lock' });
                throw new AppError("Giao dịch đang được xử lý bởi luồng khác", 429);
            }

            try {
                // --- XỬ LÝ NHÁNH TIỀN RA (OUTBOUND) ---
                if (isOutbound) {
                    // Dò tìm mã Giải Ngân. Cú pháp sinh tử: GN {ObjectId 24 ký tự}
                    const gnMatch = content.match(/GN\s*([A-Z0-9]{24})/i);
                    
                    if (gnMatch) {
                        const requestId = gnMatch[1].toLowerCase();
                        
                        // KHÔNG GỌI SERVICE GIẢI NGÂN Ở ĐÂY. Bắn EventBus để tách bạch Module.
                        if (this.eventBus) {
                            this.eventBus.emit('WEBHOOK_DISBURSEMENT_OUTBOUND', {
                                requestId,
                                amount: transferAmount,
                                bankTransactionRef: bankRef
                            });
                        }
                        
                        await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'PROCESSED', {
                            processedAt: new Date(), note: 'Disbursement Event Emitted'
                        });
                        return { status: 'processed_outbound_disbursement' };
                    }
                    
                    await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'IGNORED', { errorMessage: 'Tiền ra không phải Giải ngân tự động' });
                    return { status: 'ignored_outbound' };
                }

                // --- XỬ LÝ NHÁNH TIỀN VÀO (INBOUND) ---
                const [existingTx, existingSuspense] = await Promise.all([
                    this.transactionRepository.findByBankTransactionRef(bankRef),
                    this.suspenseTransactionRepository.findByBankTransactionRef(bankRef)
                ]);

                if (existingTx || existingSuspense) {
                    await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'IGNORED', { errorMessage: 'Duplicate BankRef' });
                    return { status: 'ignored_already_processed' };
                }

                const possibleCodes = this._extractTransactionCodes(content);
                let baseTx = null;

                for (const code of possibleCodes) {
                    const tx = await this.transactionRepository.findByGatewayId(code);
                    if (tx && tx.status === 'PENDING') {
                        baseTx = tx; break;
                    }
                }

                let processResult;
                if (baseTx) {
                    processResult = await this._processMatchedDonation(baseTx, transferAmount, bankRef, verifiedData);
                } else {
                    processResult = await this.suspenseService.recordSuspense(transferAmount, bankRef, content);
                }

                await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'PROCESSED', { processedAt: new Date() });
                return processResult;

            } finally {
                const releaseScript = `
                    if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end
                `;
                await redisClient.eval(releaseScript, 1, lockKey, lockValue);
            }

        } catch (error) {
            await this.webhookAuditLogRepository.updateStatus(auditLog._id, 'FAILED', { errorMessage: error.message || 'Unknown Webhook Error' });
            throw error;
        }
    }

    _extractTransactionCodes(content) {
        const regex10Digits = /\b(\d{10})\b/g;
        const regexLegacy = /DONATE\s*([A-Z0-9]+)/g;
        const matches10 = [...content.matchAll(regex10Digits)].map(m => m[1]);
        const matchesLegacy = [...content.matchAll(regexLegacy)].map(m => m[1]);
        return [...new Set([...matches10, ...matchesLegacy])];
    }

    async _processMatchedDonation(baseTx, transferAmount, bankRef, rawWebhook) {
        const feeRate = this.config?.platformFeePercent || 0.015;
        const { netAmount, platformFee } = MoneyMath.calculateProRata(transferAmount, feeRate);

        const result = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const currentTx = await this.transactionRepository.updateStatusIfPending(
                baseTx.gatewayTransactionId, 'COMPLETED',
                { grossAmount: transferAmount, amount: netAmount, netAmount: netAmount, platformFee: platformFee, bankTransactionRef: bankRef, gatewayResponse: rawWebhook },
                session
            );

            if (!currentTx) throw new AppError(`Xung đột hệ thống: Giao dịch đã được xử lý bởi luồng khác.`, 409);

            const updatedEscrow = await this.escrowRepository.incrementBalance(currentTx.projectId, netAmount, session);
            const updatedProject = await this.projectRepository.incrementFunding(currentTx.projectId, netAmount, session);
            await this.systemFinancialRepository.incrementSystemFunds(platformFee, 0, session);

            let isHardCapped = false;
            if (updatedProject.targetAmount > 0) {
                const currentPercentage = (updatedProject.currentAmount / updatedProject.targetAmount) * 100;
                if (currentPercentage >= 110 && updatedProject.status === PROJECT_STATUS.FUNDING) {
                    await this.projectRepository.transitionStatus(updatedProject._id, PROJECT_STATUS.FUNDING, PROJECT_STATUS.EXECUTING, session);
                    isHardCapped = true;
                }
            }

            let donorName = "Nhà hảo tâm ẩn danh";
            if (currentTx.donorRef && !currentTx.isAnonymous) {
                const donor = await this.userRepository.findById(currentTx.donorRef);
                if (donor) donorName = donor.fullName || "Nhà hảo tâm";
            }

            dispatchEvent(DOMAIN_EVENTS.DONATION_SUCCESSFUL, {
                transactionId: String(currentTx._id), projectId: String(currentTx.projectId), projectName: updatedProject.title,
                donorId: currentTx.donorRef ? String(currentTx.donorRef) : null, donorName: donorName,
                amount: transferAmount, netAmount: currentTx.netAmount, currentEscrowBalance: updatedEscrow.availableBalance
            });

            return { tx: currentTx, status: 'success' };
        });

        if (result.status === 'success') {
            try {
                const redisClient = this.redis.getClient();
                const statusPayload = JSON.stringify({ status: 'COMPLETED', transactionId: result.tx._id.toString(), amount: transferAmount, netAmount: (result.tx.netAmount || transferAmount) });
                await redisClient.publish(`tx_status:${result.tx._id.toString()}`, statusPayload);
            } catch (err) {
                console.error('[Redis PubSub] Lỗi publish transaction status:', err.message);
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
                        type: 'REFUND', amount: donation.amount, grossAmount: donation.amount, netAmount: -donation.amount,
                        platformFee: 0, projectId: donation.projectId, donorRef: donation.donorRef,
                        status: 'COMPLETED', message: 'Hoàn tiền 100% tự động vào ví do dự án gọi vốn thất bại'
                    }, session);

                    await this.walletRepository.incrementBalance(donation.donorRef, donation.amount, session);
                    await this.escrowRepository.recordRefund(donation.projectId, donation.amount, session);
                    return true;
                });

                if (wasProcessed) {
                    processedCount++;
                    if (this.eventBus && donation.donorRef) {
                        this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_REFUNDED, { userId: String(donation.donorRef), transactionId: String(donation._id), amount: donation.amount, isAutoRefund: true });
                    }
                }
            } catch (error) { console.error(`[Auto-Refund] Lỗi hoàn tiền cho TX ${donation._id}:`, error.message); }
        }

        await this.transactionManager.runInTransaction(async (session) => {
            const project = await this.projectRepository.findById(projectId, session);
            if (project) {
                const updates = {};
                if (project.currentAmount > 0) updates.currentAmount = 0;
                
                updates.refundSummary = {
                    isRefunded: true,
                    totalRefunded: donations.reduce((sum, d) => sum + d.amount, 0),
                    donorCount: processedCount,
                    refundedAt: new Date(),
                    message: `Hệ thống đã hoàn tất đối soát và hoàn tiền 100% tự động thành công cho ${processedCount} lượt quyên góp.`
                };

                await this.projectRepository.updateStatus(projectId, project.status, updates, session);
            }
        });

        return { success: true, processedCount };
    }

    async processUserRefundRequest(userId, transactionId, payload = {}) {
        const { reason } = payload;
        const tx = await this.transactionRepository.findById(transactionId);
        if (!tx) throw new AppError("Không tìm thấy giao dịch", 404);
        if (String(tx.donorRef) !== String(userId)) throw new AppError("Bạn không có quyền hoàn tiền giao dịch này", 403);
        if (tx.status !== 'COMPLETED' || !['DONATION', 'DONATION_FROM_WALLET'].includes(tx.type)) throw new AppError("Chỉ có thể hoàn tiền các giao dịch donate thành công", 400);

        const existingRefundRequest = await this.transactionRepository.findRefundRequestBySourceTransaction(tx._id);
        if (existingRefundRequest) throw new AppError("Giao dịch này đã có yêu cầu hoàn tiền trước đó.", 400);

        const hoursSinceDonation = (Date.now() - new Date(tx.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceDonation > (USER_REFUND_POLICY.ALLOWED_HOURS || 72)) throw new AppError("Đã quá thời hạn 72h được phép hoàn tiền tự động", 400);

        const penaltyRate = USER_REFUND_POLICY.PERCENTAGE_FEE || 0.02;
        const refundAmount = Math.floor(tx.netAmount * (1 - penaltyRate));
        const retainedFee = tx.netAmount - refundAmount;

        const result = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const refundRequestTx = await this.transactionRepository.create({
                type: 'USER_REFUND_REQUEST', amount: refundAmount, grossAmount: refundAmount, netAmount: refundAmount,
                platformFee: 0, projectId: tx.projectId, donorRef: userId, status: 'PENDING',
                message: reason || 'Yêu cầu hoàn tiền từ người dùng',
                gatewayResponse: {
                    sourceTransactionId: String(tx._id),
                    originalAmount: tx.netAmount,
                    refundAmount,
                    retainedFee,
                    reason: reason || null,
                    requestedAt: new Date().toISOString()
                }
            }, session);

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: ['ADMIN_GROUP'],
                title: 'Có yêu cầu hoàn tiền mới',
                message: `Người dùng vừa gửi yêu cầu hoàn tiền cho giao dịch ${String(tx._id).slice(-8).toUpperCase()}.`
            });

            return refundRequestTx;
        });

        return {
            requestId: result._id,
            status: result.status,
            refundAmount,
            retainedFee,
            message: 'Đã gửi yêu cầu hoàn tiền. Vui lòng chờ admin duyệt.'
        };
    }

    async getRefundRequestsForAdmin(query = {}) {
        const page = parseInt(query?.page, 10) || 1;
        const limit = parseInt(query?.limit, 10) || 10;
        const status = query?.status || 'PENDING';
        const skip = (page - 1) * limit;

        const { requests, total } = await this.transactionRepository.findRefundRequestsForAdmin({
            skip,
            limit,
            status
        });

        const items = requests.map((req) => {
            const sourceTransactionId = req?.gatewayResponse?.sourceTransactionId || null;
            return {
                id: req._id,
                status: req.status,
                requestedAt: req.createdAt,
                updatedAt: req.updatedAt,
                reason: req?.gatewayResponse?.reason || req.message || '',
                sourceTransactionId,
                originalAmount: req?.gatewayResponse?.originalAmount ?? null,
                refundAmount: req?.gatewayResponse?.refundAmount ?? req.amount,
                retainedFee: req?.gatewayResponse?.retainedFee ?? 0,
                donor: req.donorRef || null,
                project: req.projectId || null,
                adminDecision: req?.gatewayResponse?.adminDecision || null
            };
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

    async approveRefundRequest(adminId, requestId, payload = {}) {
        const note = payload?.note || '';
        const requestTx = await this.transactionRepository.findById(requestId);
        if (!requestTx || requestTx.type !== 'USER_REFUND_REQUEST') throw new AppError('Không tìm thấy yêu cầu hoàn tiền', 404);
        if (requestTx.status !== 'PENDING') throw new AppError('Yêu cầu hoàn tiền này đã được xử lý.', 400);

        const sourceTransactionId = requestTx?.gatewayResponse?.sourceTransactionId;
        const sourceTx = await this.transactionRepository.findById(sourceTransactionId);
        if (!sourceTx) throw new AppError('Giao dịch gốc không tồn tại.', 404);
        if (sourceTx.status !== 'COMPLETED') throw new AppError('Giao dịch gốc không còn hợp lệ để hoàn tiền.', 400);

        const penaltyRate = USER_REFUND_POLICY.PERCENTAGE_FEE || 0.02;
        const refundAmount = Math.floor(sourceTx.netAmount * (1 - penaltyRate));
        const retainedFee = sourceTx.netAmount - refundAmount;

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const nextGatewayResponse = {
                ...(requestTx.gatewayResponse || {}),
                adminDecision: {
                    decision: 'APPROVED',
                    note,
                    actorId: String(adminId),
                    decidedAt: new Date().toISOString()
                }
            };

            await this.transactionRepository.updateStatus(requestTx._id, 'COMPLETED', {
                amount: refundAmount,
                grossAmount: refundAmount,
                netAmount: refundAmount,
                gatewayResponse: nextGatewayResponse
            }, session);

            await this.transactionRepository.updateStatus(sourceTx._id, 'REFUNDED', {}, session);

            if (retainedFee > 0) {
                await this.transactionRepository.create({
                    type: 'PLATFORM_FEE',
                    amount: retainedFee,
                    grossAmount: retainedFee,
                    netAmount: retainedFee,
                    platformFee: 0,
                    projectId: null,
                    donorRef: null,
                    status: 'COMPLETED',
                    message: 'Phí duy trì nền tảng từ yêu cầu hoàn tiền đã duyệt',
                    gatewayResponse: {
                        refundRequestId: String(requestTx._id),
                        sourceTransactionId: String(sourceTx._id)
                    }
                }, session);
            }

            await this.projectRepository.decrementFunding(sourceTx.projectId, sourceTx.netAmount, session);
            await this.escrowRepository.recordRefund(sourceTx.projectId, sourceTx.netAmount, session);
            await this.walletRepository.incrementBalance(sourceTx.donorRef, refundAmount, session);
            await this.systemFinancialRepository.incrementSystemFunds(0, retainedFee, session);

            return {
                requestId: requestTx._id,
                sourceTransactionId: sourceTx._id,
                refundAmount,
                retainedFee
            };
        });

        if (this.eventBus) {
            this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_REFUNDED, {
                userId: String(sourceTx.donorRef),
                transactionId: String(sourceTx._id),
                amount: result.refundAmount,
                isAutoRefund: false
            });
        }

        return {
            ...result,
            message: 'Đã duyệt hoàn tiền và cập nhật số dư ví người dùng.'
        };
    }

    async rejectRefundRequest(adminId, requestId, payload = {}) {
        const note = payload?.note || '';
        const requestTx = await this.transactionRepository.findById(requestId);
        if (!requestTx || requestTx.type !== 'USER_REFUND_REQUEST') throw new AppError('Không tìm thấy yêu cầu hoàn tiền', 404);
        if (requestTx.status !== 'PENDING') throw new AppError('Yêu cầu hoàn tiền này đã được xử lý.', 400);

        const nextGatewayResponse = {
            ...(requestTx.gatewayResponse || {}),
            adminDecision: {
                decision: 'REJECTED',
                note,
                actorId: String(adminId),
                decidedAt: new Date().toISOString()
            }
        };

        await this.transactionRepository.updateStatus(requestTx._id, 'REJECTED', {
            gatewayResponse: nextGatewayResponse
        });

        return {
            requestId: requestTx._id,
            status: 'REJECTED',
            message: 'Đã từ chối yêu cầu hoàn tiền.'
        };
    }

    async processWalletWithdrawal(userId, payload) {
        const { amount, bankAccountId } = payload;
        const bankAccount = await this.bankAccountRepository.findById(bankAccountId);
        if (!bankAccount || !bankAccount.userId.equals(userId)) throw new AppError("Tài khoản ngân hàng không hợp lệ.", 403);
        if (!bankAccount.isVerified || bankAccount.status !== 'ACTIVE') throw new AppError("Tài khoản ngân hàng chưa xác thực hoặc bị khóa.", 400);

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const updatedWallet = await this.walletRepository.incrementBalance(userId, -amount, session).catch(err => {
                if (err.name === 'ValidationError') throw new AppError(`Số dư ví không đủ để rút.`, 400);
                throw err;
            });

            const withdrawalTx = await this.transactionRepository.create({
                type: 'WALLET_WITHDRAWAL', amount: amount, projectId: null, donorRef: userId, status: 'PENDING',
                gatewayResponse: { bankName: bankAccount.bankName, accountNumber: bankAccount.accountNumber, accountName: bankAccount.accountName, requestedAt: new Date().toISOString() }
            }, session);

            return { withdrawalId: withdrawalTx._id, status: 'PENDING', amountRequested: amount, remainingBalance: updatedWallet.balance };
        });

        if (this.eventBus) this.eventBus.emit(DOMAIN_EVENTS.TRANSACTION_WITHDRAWAL_REQUESTED, { userId: String(userId), transactionId: String(result.withdrawalId), amount: amount });
        return result;
    }

    async getUserDonationHistory(userId, query) {
        const page = parseInt(query?.page, 10) || 1;
        const limit = parseInt(query?.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const { transactions, total } = await this.transactionRepository.findUserDonations(userId, skip, limit);

        const donationIds = transactions.map((tx) => String(tx._id));
        const refundRequests = await this.transactionRepository.findRefundRequestsBySourceTransactionIds(donationIds);
        const refundRequestMap = new Map(
            refundRequests.map((request) => [String(request?.gatewayResponse?.sourceTransactionId), request])
        );

        const donations = transactions.map((tx) => {
            const refundRequest = refundRequestMap.get(String(tx._id));
            return {
                ...tx,
                refundRequest: refundRequest ? {
                    id: refundRequest._id,
                    status: refundRequest.status,
                    requestedAt: refundRequest.createdAt,
                    updatedAt: refundRequest.updatedAt,
                    refundAmount: refundRequest?.gatewayResponse?.refundAmount ?? refundRequest.amount,
                    retainedFee: refundRequest?.gatewayResponse?.retainedFee ?? 0,
                    note: refundRequest?.gatewayResponse?.adminDecision?.note || ''
                } : null
            };
        });

        return { donations, pagination: { totalItems: total, currentPage: page, totalPages: Math.ceil(total / limit) || 1, hasNextPage: page * limit < total } };
    }

    async getProjectDonors(projectId, query) {
        const page = parseInt(query?.page, 10) || 1;
        const limit = parseInt(query?.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const { transactions, total } = await this.transactionRepository.findPublicDonorsByProject(projectId, skip, limit);
        const formattedDonors = transactions.map(tx => {
            if (tx.isAnonymous) return { ...tx, donorRef: { fullName: "Nhà hảo tâm ẩn danh", avatar: null } };
            return tx;
        });

        return { donors: formattedDonors, pagination: { totalItems: total, currentPage: page, totalPages: Math.ceil(total / limit) || 1, hasNextPage: page * limit < total } };
    }

    async getTransactionStatus(userId, transactionId) {
        const tx = await this.transactionRepository.findById(transactionId);
        if (!tx) throw new AppError("Không tìm thấy giao dịch", 404);
        if (String(tx.donorRef) !== String(userId)) throw new AppError("Không có quyền truy cập", 403);
        return { id: tx._id, status: tx.status, netAmount: tx.netAmount, createdAt: tx.createdAt };
    }

    async updateDonationMessage() {
        throw new AppError('Tính năng chỉnh sửa lời nhắn đã bị tắt.', 410);
    }

    async confirmPaymentIntent(userId, transactionId) {
        const updatedTx = await this.transactionRepository.markAsUserConfirmed(transactionId, userId);

        if (!updatedTx) {
            const existingTx = await this.transactionRepository.findById(transactionId);
            if (!existingTx) throw new AppError("Không tìm thấy giao dịch", 404);
            if (String(existingTx.donorRef) !== String(userId)) throw new AppError("Không có quyền thao tác", 403);
            if (existingTx.status !== 'PENDING') throw new AppError(`Không thể xác nhận. Giao dịch đang ở trạng thái: ${existingTx.status}`, 400);
            throw new AppError("Không thể cập nhật trạng thái giao dịch", 500);
        }

        return { id: updatedTx._id, status: updatedTx.status, userConfirmedPaid: updatedTx.userConfirmedPaid, userConfirmedAt: updatedTx.userConfirmedAt };
    }

    _getVietnamTMinus1Bounds(executionDate = new Date()) {
        const tMinus1 = new Date(executionDate);
        tMinus1.setDate(tMinus1.getDate() - 1);
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
        const dateString = formatter.format(tMinus1);
        const startOfDay = new Date(`${dateString}T00:00:00.000+07:00`);
        const endOfDay = new Date(`${dateString}T23:59:59.999+07:00`);
        return { dateString, targetDate: tMinus1, startOfDay, endOfDay };
    }

    async executeDailyReconciliation(executionDate = new Date()) {
        const { dateString, targetDate, startOfDay, endOfDay } = this._getVietnamTMinus1Bounds(executionDate);
        console.log(`\n[Reconciliation Mastermind] 🕒 Khởi chạy chốt sổ T-1 cho ngày: ${dateString} (GMT+7)`);

        const bankTransactions = await this.paymentProvider.fetchTransactionsList(targetDate);
        let sepayTotalIn = 0, sepayTotalOut = 0;
        const expectedInRefs = new Map();

        bankTransactions.forEach(tx => {
            const amountIn = Number(tx.amount_in || 0);
            const amountOut = Number(tx.amount_out || 0);
            const ref = String(tx.reference_number || tx.referenceCode);

            if (amountIn > 0) { sepayTotalIn += amountIn; expectedInRefs.set(ref, amountIn); }
            if (amountOut > 0) sepayTotalOut += amountOut;
        });

        const refsArray = Array.from(expectedInRefs.keys());
        const [dbTransactions, dbSuspense, dbOutTxs, previousLedger] = await Promise.all([
            refsArray.length > 0 ? this.transactionRepository.findByBankRefsForReconciliation(refsArray) : [],
            refsArray.length > 0 ? this.suspenseTransactionRepository.findByBankRefsForReconciliation(refsArray) : [],
            this.transactionRepository.findOutboundTransactionsForDate(startOfDay, endOfDay),
            this.dailyLedgerLogRepository.getLatestLogBefore(dateString)
        ]);

        const [totalEscrow, totalSuspense, totalWallet, systemRecord] = await Promise.all([
            this.escrowRepository.getSystemTotalEscrow(), this.suspenseTransactionRepository.getUnallocatedFundsTotal(),
            this.walletRepository.getTotalSystemWalletBalance(), this.systemFinancialRepository.getSystemRecord()
        ]);

        const systemFee = (systemRecord?.platformFeePendingWithdrawal || 0) + (systemRecord?.retainedPenaltyFund || 0);
        const currentDbTotalLiabilities = totalEscrow + totalSuspense + totalWallet + systemFee;
        const openingBalance = previousLedger ? previousLedger.closingBalance : 0;
        const expectedClosingBalance = openingBalance + sepayTotalIn - sepayTotalOut;

        let dbTotalInMatched = 0;
        const breakdown = {
            snapshot: { realBankBalance: expectedClosingBalance, dbLiabilities: { total: currentDbTotalLiabilities, escrow: totalEscrow, suspense: totalSuspense, wallet: totalWallet, systemFee }, delta: expectedClosingBalance - currentDbTotalLiabilities },
            matchedIn: 0, matchedOut: 0, missingInDbRefs: [], amountMismatches: [], message: "Sổ cái khớp hoàn toàn."
        };

        for (const [ref, expectedAmount] of expectedInRefs.entries()) {
            const foundTx = dbTransactions.find(t => t.bankTransactionRef === ref && t.status === 'COMPLETED');
            const foundSuspense = dbSuspense.find(s => s.bankTransactionRef === ref && ['UNALLOCATED', 'ALLOCATED'].includes(s.status));
            let dbAmount = 0;
            if (foundTx) dbAmount += (foundTx.grossAmount || foundTx.amount);
            if (foundSuspense) dbAmount += foundSuspense.amount;

            if (dbAmount === 0) breakdown.missingInDbRefs.push(ref);
            else if (dbAmount !== expectedAmount) breakdown.amountMismatches.push({ ref, bankAmount: expectedAmount, dbAmount });
            else dbTotalInMatched += dbAmount;
        }
        breakdown.matchedIn = dbTotalInMatched;

        let dbTotalOutMatched = 0;
        dbOutTxs.forEach(tx => dbTotalOutMatched += (tx.grossAmount || tx.amount));
        breakdown.matchedOut = dbTotalOutMatched;

        const isSuccess = (breakdown.missingInDbRefs.length === 0 && breakdown.amountMismatches.length === 0 && sepayTotalIn === dbTotalInMatched) && (sepayTotalOut === dbTotalOutMatched);
        const status = isSuccess ? 'MATCH' : 'DISCREPANCY';

        if (!isSuccess) breakdown.message = `[CẢNH BÁO] Lệch Inbound/Outbound. Bank In: ${sepayTotalIn}, DB In: ${dbTotalInMatched}. Bank Out: ${sepayTotalOut}, DB Out: ${dbTotalOutMatched}.`;

        await this.transactionManager.runInTransaction(async (session) => {
            await this.dailyLedgerLogRepository.upsertLogForDate(dateString, {
                openingBalance: openingBalance, totalIn: sepayTotalIn, totalOut: sepayTotalOut,
                closingBalance: expectedClosingBalance, internalDbBalance: currentDbTotalLiabilities,
                status: status, discrepancyAmount: Math.abs(sepayTotalIn - dbTotalInMatched) + Math.abs(sepayTotalOut - dbTotalOutMatched), breakdown: breakdown
            }, session);
        });

        if (!isSuccess || breakdown.snapshot.delta !== 0) {
            console.error(`[CRITICAL] 🛑 CẢNH BÁO: ${breakdown.message} | Lệch tổng quỹ: ${breakdown.snapshot.delta}`);
            if (this.eventBus) this.eventBus.emit('SYSTEM_ALERT', { level: 'CRITICAL', type: 'RECONCILIATION_FAILED', message: `Lệch luồng thu chi hoặc quỹ. Delta: ${breakdown.snapshot.delta} VNĐ.` });
            return { success: false, status, snapshot: breakdown.snapshot };
        }

        return { success: true, status, snapshot: breakdown.snapshot };
    }
}

export default TransactionService;