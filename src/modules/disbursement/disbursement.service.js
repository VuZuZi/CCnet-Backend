import AppError from '../../core/AppError.js';
import MoneyMath from '../../core/MoneyMath.js';
import { MILESTONE_STATUS, PROJECT_STATUS, PROJECT_TYPE } from '../project/project.constant.js';
import { BANK_ACCOUNT_STATUS, getBankByShortName } from '../bankAccount/bankAccount.constant.js';
import { DOMAIN_EVENTS } from '../../config/notification.js';
import { TRANSACTION_TYPES } from '../transaction/transaction.constant.js';

class DisbursementService {
    constructor({
        disbursementRequestRepository,
        projectRepository,
        escrowRepository,
        bankAccountRepository,
        organizerRequestRepository,
        transactionRepository,
        milestoneEvidenceRepository,
        transactionManager,
        redis,
        eventBus = null
    }) {
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.projectRepository = projectRepository;
        this.escrowRepository = escrowRepository;
        this.bankAccountRepository = bankAccountRepository;
        this.organizerRequestRepository = organizerRequestRepository;
        this.transactionRepository = transactionRepository;
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.transactionManager = transactionManager;
        this.redis = redis;
        this.eventBus = eventBus;
    }


    async _publishStatusUpdate(requestId, status, payload = {}) {
        try {
            const redisClient = this.redis.getClient();
            const message = JSON.stringify({
                requestId,
                status,
                ...payload,
                updatedAt: new Date()
            });
            await redisClient.publish(`disbursement:${requestId}:status`, message);
        } catch (err) {
            console.error(`[Redis PubSub] Disbursement Publish Error (${requestId}):`, err.message);
        }
    }

    _normalizeId(value) {
        if (!value) return null;
        return String(value?._id || value?.id || value);
    }

    _buildDisbursementMetadata(request, realtimeType, extra = {}) {
        return {
            domainEvent: DOMAIN_EVENTS.DISBURSEMENT_STATUS_CHANGED,
            realtimeType,
            projectId: this._normalizeId(request?.projectId),
            milestoneId: request?.milestoneId || null,
            disbursementRequestId: this._normalizeId(request?._id),
            organizerId: this._normalizeId(request?.organizerId),
            status: request?.status || extra.status || null,
            requestedAmount: request?.requestedAmount,
            approvedAmount: request?.approvedAmount,
            updatedAt: new Date().toISOString(),
            ...extra
        };
    }

    async _emitSystemNotification(event) {
        if (!this.eventBus || !event) return;
        try {
            const results = await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, event);
            const rejected = (results || []).filter((result) => result.status === 'rejected');
            if (rejected.length > 0) {
                console.error('[DisbursementService] Notification emit failed', {
                    event: DOMAIN_EVENTS.SYSTEM_NOTIFICATION,
                    rejectedCount: rejected.length,
                    errors: rejected.map((result) => result.reason?.message || result.reason)
                });
            }
        } catch (error) {
            console.error('[DisbursementService] Notification emit failed', {
                event: DOMAIN_EVENTS.SYSTEM_NOTIFICATION,
                error: error?.message || error
            });
        }
    }

    _normalizeAccountName(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/Ä‘/g, 'd').replace(/Ä/g, 'D')
            .toUpperCase()
            .trim();
    }

    _generateVietQRData(request) {
        const snapshot = request.bankAccountSnapshot;

        if (!snapshot || !snapshot.bin || !snapshot.accountNumber) {
            throw new AppError('[Critical]: Dá»¯ liá»‡u Snapshot NgÃ¢n hÃ ng bá»‹ thiáº¿u mÃ£ BIN hoáº·c Sá»‘ tÃ i khoáº£n. KhÃ´ng thá»ƒ sinh mÃ£ VietQR.', 500);
        }

        const bin = snapshot.bin;
        const accNo = snapshot.accountNumber;
        const amount = request.approvedAmount;
        const transferMemo = `GN ${request._id}`;

        const normalizedAccName = this._normalizeAccountName(snapshot.accountName);

        const qrUrl = `https://img.vietqr.io/image/${bin}-${accNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(normalizedAccName)}`;

        return { transferMemo, qrUrl };
    }

    async _executeDisbursementCommit(request, bankTransactionRef, transferredBy, session) {
        const committedEscrow = await this.escrowRepository.commitDisbursement(request.projectId, request.approvedAmount, session);
        if (!committedEscrow) {
            throw new AppError('Khong the commit giai ngan vi pendingDisbursementAmount khong hop le', 409);
        }

        const retainedUpdated = await this.escrowRepository.updateOrganizerRetainedBalance(request.projectId, request.approvedAmount, session);
        if (!retainedUpdated) {
            throw new AppError('Khong tim thay escrow de cap nhat organizerRetainedBalance', 404);
        }

        const markedRequest = await this.disbursementRequestRepository.markAsTransferredAtomic(request._id, bankTransactionRef, transferredBy, session);
        if (!markedRequest) {
            throw new AppError('Yeu cau giai ngan da duoc xu ly boi luong khac', 409);
        }
        
        await this.transactionRepository.create({
            type: TRANSACTION_TYPES.DISBURSEMENT,
            amount: request.approvedAmount,
            netAmount: request.approvedAmount,
            currency: 'VND',
            projectId: request.projectId,
            milestoneId: request.milestoneId,
            organizerRef: request.organizerId,
            gatewayTransactionId: bankTransactionRef,
            status: 'COMPLETED',
            reconciled: false
        }, session);

        await this.projectRepository.incrementMilestoneDisbursed(
            request.projectId,
            request.milestoneId,
            request.approvedAmount,
            session
        );

        return markedRequest;
    }

    async getOrganizerRequests(organizerId, query) {
        const { page, limit, projectId, status } = query;
        const skip = (page - 1) * limit;

        const result = await this.disbursementRequestRepository.findAndCountByOrganizer(
            organizerId,
            { projectId, status, skip, limit }
        );

        return {
            requests: result.requests,
            pagination: { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) }
        };
    }

    async getRequestDetail(requestId, userId, role) {
        const request = await this.disbursementRequestRepository.findById(requestId);
        if (!request) throw new AppError('KhÃ´ng tÃ¬m tháº¥y yÃªu cáº§u giáº£i ngÃ¢n', 404);

        const isOwner = String(request.organizerId) === String(userId);
        const isPrivileged = ['admin', 'manager'].includes(role);

        if (!isOwner && !isPrivileged) throw new AppError('Báº¡n khÃ´ng cÃ³ quyá»n xem chi tiáº¿t yÃªu cáº§u nÃ y', 403);

        const result = { request };

        if (request.status === 'APPROVED_PENDING_TRANSFER' && isPrivileged) {
            result.paymentInfo = this._generateVietQRData(request);
        }

        return result;
    }

    async createRequest(organizerId, payload) {
        const { projectId, milestoneId } = payload;

        const project = await this.projectRepository.findById(projectId);
        if (!project || String(project.organizerId) !== String(organizerId)) throw new AppError('Du an khong ton tai hoac ban khong co quyen', 404);
        if (project.projectType !== PROJECT_TYPE.FUNDED) throw new AppError('Chi du an FUNDED moi duoc phep xin giai ngan', 400);
        if (project.status !== PROJECT_STATUS.EXECUTING) throw new AppError('Chi co the xin giai ngan khi du an dang EXECUTING', 400);

        const milestone = project.milestones.find(m => m.milestoneId === milestoneId);
        if (!milestone) throw new AppError('Khong tim thay moc giai ngan', 404);
        if (milestone.status !== MILESTONE_STATUS.PENDING) throw new AppError('Chi duoc xin giai ngan cho moc dang PENDING', 400);

        const currentIdx = project.milestones.findIndex(m => m.milestoneId === milestoneId);
        if (currentIdx > 0) {
            const prevMilestone = project.milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) throw new AppError('Má»‘c trÆ°á»›c Ä‘Ã³ chÆ°a nghiá»‡m thu xong, khÃ´ng thá»ƒ giáº£i ngÃ¢n cuá»‘n chiáº¿u', 400);
        }

        const activeRequest = await this.disbursementRequestRepository.findActiveRequestByMilestone(projectId, milestoneId);
        if (activeRequest) throw new AppError('Äang cÃ³ má»™t yÃªu cáº§u giáº£i ngÃ¢n chÆ°a hoÃ n táº¥t cho Má»‘c nÃ y', 400);

        let unspentFromPrevious = 0;
        if (currentIdx > 0) {
            const prevMilestone = project.milestones[currentIdx - 1];
            const prevEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(projectId, prevMilestone.milestoneId);
            if (prevEvidence && prevEvidence.financialReport) unspentFromPrevious = prevEvidence.financialReport.unspentAmount || 0;
        }

        let requestedAmount = MoneyMath.subtract(milestone.targetAmount, unspentFromPrevious);
        if (requestedAmount < 0) requestedAmount = 0;

        if (requestedAmount === 0) {
            throw new AppError('Sá»‘ tiá»n dÆ° tá»« má»‘c trÆ°á»›c Ä‘Ã£ Ä‘á»§ Ä‘á»ƒ thá»±c hiá»‡n má»‘c nÃ y, khÃ´ng cáº§n giáº£i ngÃ¢n thÃªm.', 400);
        }

        const escrow = await this.escrowRepository.findByProjectId(projectId);
        if (!escrow || escrow.availableBalance < requestedAmount) throw new AppError(`Sá»‘ dÆ° kháº£ dá»¥ng trong Escrow (${escrow?.availableBalance || 0}Ä‘) khÃ´ng Ä‘á»§ Ä‘á»ƒ giáº£i ngÃ¢n`, 400);

        const approvedOrganizerRequest = await this.organizerRequestRepository.findLatestApprovedByUserId(organizerId);
        if (!approvedOrganizerRequest) {
            throw new AppError('Không tìm thấy hồ sơ tổ chức đã được duyệt để xác định tài khoản nhận giải ngân.', 400);
        }

        const bankName = String(approvedOrganizerRequest.bankName || '').trim();
        const accountNumber = String(approvedOrganizerRequest.bankAccountNumber || '').trim();
        const accountName = String(approvedOrganizerRequest.bankAccountName || '').trim();

        if (!bankName || !accountNumber || !accountName) {
            throw new AppError('Hồ sơ tổ chức đã được duyệt nhưng thiếu thông tin tài khoản nhận giải ngân. Vui lòng liên hệ quản trị viên để cập nhật hồ sơ.', 400);
        }

        let bin = null;
        if (approvedOrganizerRequest.bankAccountId) {
            const bankAccount = await this.bankAccountRepository.findById(approvedOrganizerRequest.bankAccountId);
            bin = bankAccount?.bin || null;
        }

        if (!bin) {
            const bankInfo = getBankByShortName(bankName);
            bin = bankInfo?.bin || null;
        }

        if (!bin) {
            throw new AppError('Ngân hàng trong hồ sơ tổ chức chưa được hỗ trợ tạo VietQR.', 400);
        }

        const requiredApprovals = 1;

        const snapshot = {
            bankName,
            accountNumber,
            accountName,
            bin: bin
        };

        const newRequest = await this.transactionManager.runInTransaction(async (session) => {
            const newRequest = await this.disbursementRequestRepository.create({
                projectId, milestoneId, organizerId, requestedAmount, requiredApprovals, bankAccountSnapshot: snapshot, status: 'PENDING'
            }, session);

            return newRequest;
        });

        await this._emitSystemNotification({
            recipientIds: ['ADMIN_GROUP'],
            title: 'Yeu cau giai ngan moi',
            message: `Du an ${project.title} vua xin giai ngan ${requestedAmount.toLocaleString()}d cho moc ${milestone.title}`,
            actionUrl: `/admin/finance/${projectId}`,
            entityType: 'disbursement_request',
            entityId: String(newRequest._id),
            metadata: this._buildDisbursementMetadata(newRequest, 'disbursement_requested', {
                domainEvent: DOMAIN_EVENTS.DISBURSEMENT_REQUESTED
            })
        });

        return newRequest;
    }

    async processApproval(requestId, managerId, payload) {
        const { decision, note } = payload;

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('KhÃ´ng tÃ¬m tháº¥y yÃªu cáº§u', 404);
            if (request.status !== 'PENDING') throw new AppError(`KhÃ´ng thá»ƒ duyá»‡t yÃªu cáº§u Ä‘ang á»Ÿ tráº¡ng thÃ¡i: ${request.status}`, 400);

            const hasApproved = request.approvals.some(a => String(a.managerId) === String(managerId));
            if (hasApproved) throw new AppError('Báº¡n Ä‘Ã£ kÃ½ duyá»‡t yÃªu cáº§u nÃ y rá»“i (COI Enforcement)', 403);

            const newApproval = { managerId, decision, note, approvedAt: new Date() };

            const pushedRequest = await this.disbursementRequestRepository.addApprovalAtomic(
                requestId, managerId, newApproval, session
            );

            if (!pushedRequest) throw new AppError('Xung Ä‘á»™t dá»¯ liá»‡u. CÃ³ thá»ƒ má»™t Admin khÃ¡c Ä‘Ã£ duyá»‡t hoáº·c yÃªu cáº§u Ä‘Ã£ thay Ä‘á»•i tráº¡ng thÃ¡i.', 409);

            const approvedCount = pushedRequest.approvals.filter(a => a.decision === 'APPROVED').length;

            let newStatus = 'PENDING';
            let extraPayload = {};
            let qrData = null;

            if (decision === 'REJECTED') {
                newStatus = 'REJECTED';
            } else if (decision === 'HOLD') {
                newStatus = 'HOLD';
            } else if (decision === 'APPROVED') {
                if (approvedCount >= pushedRequest.requiredApprovals) {
                    const escrowUpdated = await this.escrowRepository.reserveDisbursement(
                        pushedRequest.projectId,
                        pushedRequest.requestedAmount,
                        session
                    );
                    if (!escrowUpdated) {
                        throw new AppError('So du Escrow khong du de phe duyet va tam giu lenh chuyen tien', 400);
                    }
                    newStatus = 'APPROVED_PENDING_TRANSFER';
                    extraPayload.approvedAmount = pushedRequest.requestedAmount;
                }
            }

            let finalRequest = pushedRequest;
            if (newStatus !== 'PENDING') {
                finalRequest = await this.disbursementRequestRepository.updateStatusWithPayload(
                    requestId, newStatus, extraPayload, session
                );
            }

            if (newStatus === 'APPROVED_PENDING_TRANSFER') {
                qrData = this._generateVietQRData(finalRequest);
            }

            return { request: finalRequest, paymentInfo: qrData };
        });

        if (result.request) {
            await this._publishStatusUpdate(requestId, result.request.status, {
                approvedAmount: result.request.approvedAmount
            });
        }

        if (result.request && result.request.status !== 'PENDING') {
            const requestStatus = result.request.status;
            const isApprovedPendingTransfer = requestStatus === 'APPROVED_PENDING_TRANSFER';
            const isRejectedOrHeld = ['REJECTED', 'HOLD'].includes(requestStatus);
            const realtimeType = isApprovedPendingTransfer
                ? 'disbursement_approved'
                : 'disbursement_status_changed';
            const title = isApprovedPendingTransfer
                ? 'Yeu cau giai ngan da duoc duyet'
                : isRejectedOrHeld
                    ? `Yeu cau giai ngan ${requestStatus === 'HOLD' ? 'dang bi tam giu' : 'da bi tu choi'}`
                    : 'Yêu cầu giải ngân đang chờ đủ phê duyệt.';
            const message = isApprovedPendingTransfer
                ? `Yeu cau giai ngan ${Number(result.request.approvedAmount || 0).toLocaleString()}d da duoc duyet va dang cho chuyen khoan.`
                : isRejectedOrHeld
                    ? `Ly do: ${note || 'Vui long kiem tra lai ho so'}`
                    : 'Yêu cầu giải ngân đang chờ đủ phê duyệt.';
            const metadata = this._buildDisbursementMetadata(result.request, realtimeType);

            await this._emitSystemNotification({
                recipientIds: ['ADMIN_GROUP'],
                title,
                message,
                actionUrl: `/admin/finance/${result.request.projectId}`,
                entityType: 'disbursement_request',
                entityId: String(result.request._id),
                metadata
            });

            await this._emitSystemNotification({
                recipientIds: [String(result.request.organizerId)],
                title,
                message,
                actionUrl: `/projects/${result.request.projectId}?tab=milestones`,
                entityType: 'disbursement_request',
                entityId: String(result.request._id),
                metadata
            });
        }

        return result;
    }

    async confirmAutoTransfer(requestId, bankTransactionRef, transferredAmount) {
        let finalStatus = null;
        let notificationRequest = null;

        const success = await this.transactionManager.runInTransaction(async (session) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            
            if (!request || request.status !== 'APPROVED_PENDING_TRANSFER') {
                console.warn(`[Disbursement Auto] Request ${requestId} khÃ´ng há»£p lá»‡ hoáº·c khÃ´ng á»Ÿ tráº¡ng thÃ¡i chá».`);
                return false;
            }

            if (transferredAmount !== request.approvedAmount) {
                const isOverTransfer = transferredAmount > request.approvedAmount;
                console.error(`[Disbursement Auto] ðŸ›‘ Cáº¢NH BÃO Äá»Ž: Káº¿ toÃ¡n chuyá»ƒn ${isOverTransfer ? 'DÆ¯' : 'THIáº¾U'} tiá»n (Chuyá»ƒn: ${transferredAmount}Ä‘, YÃªu cáº§u: ${request.approvedAmount}Ä‘).`);

                notificationRequest = await this.disbursementRequestRepository.updateStatusWithPayload(requestId, 'HOLD', {}, session);
                
                finalStatus = 'HOLD';
                return false;
            }

            notificationRequest = await this._executeDisbursementCommit(request, bankTransactionRef, null, session);

            console.log(`[Disbursement Auto] ÄÃ£ chá»‘t sá»• tá»± Ä‘á»™ng thÃ nh cÃ´ng Request ${requestId}`);
            
            finalStatus = 'COMPLETED';
            return true;
        });

        if (finalStatus) {
            await this._publishStatusUpdate(requestId, finalStatus, {
                transferredAmount: transferredAmount,
                bankTransactionRef
            });
        }

        if (notificationRequest) {
            const title = finalStatus === 'COMPLETED'
                ? 'Giai ngan tu dong thanh cong'
                : 'Lenh giai ngan bi HOLD';
            const message = finalStatus === 'COMPLETED'
                ? `He thong da ghi nhan khoan tien ${Number(notificationRequest.approvedAmount || 0).toLocaleString()}d da toi STK ${notificationRequest.bankAccountSnapshot?.accountNumber || ''}.`
                : `He thong ghi nhan so tien chuyen khong khop cho Request ID: ${requestId}.`;
            const metadata = this._buildDisbursementMetadata(
                notificationRequest,
                finalStatus === 'COMPLETED'
                    ? 'disbursement_transfer_completed'
                    : 'disbursement_status_changed',
                { status: finalStatus, bankTransactionRef }
            );

            await this._emitSystemNotification({
                recipientIds: ['ADMIN_GROUP'],
                title,
                message,
                actionUrl: `/admin/finance/${notificationRequest.projectId}`,
                entityType: 'disbursement_request',
                entityId: String(notificationRequest._id),
                metadata
            });

            await this._emitSystemNotification({
                recipientIds: [String(notificationRequest.organizerId)],
                title,
                message,
                actionUrl: `/projects/${notificationRequest.projectId}?tab=milestones`,
                entityType: 'disbursement_request',
                entityId: String(notificationRequest._id),
                metadata
            });
        }

        return success;
    }

    async confirmManualTransfer(requestId, adminId, payload) {
        const { bankTransactionRef } = payload;
        if (!bankTransactionRef) {
            throw new AppError('Thieu bankTransactionRef', 400);
        }

        const result = await this.transactionManager.runInTransaction(async (session) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Khong tim thay yeu cau', 404);
            if (request.status !== 'APPROVED_PENDING_TRANSFER') throw new AppError('Chi co the xac nhan chuyen khoan cho yeu cau da duyet xong', 400);

            const completedRequest = await this._executeDisbursementCommit(request, bankTransactionRef, adminId, session);

            return { success: true, message: 'Xac nhan chuyen khoan bang tay thanh cong', request: completedRequest };
        });

        await this._publishStatusUpdate(requestId, 'COMPLETED', { bankTransactionRef });

        if (result.request) {
            const metadata = this._buildDisbursementMetadata(
                result.request,
                'disbursement_transfer_completed',
                { status: 'COMPLETED', bankTransactionRef }
            );

            await this._emitSystemNotification({
                recipientIds: ['ADMIN_GROUP'],
                title: 'Giai ngan thanh cong',
                message: `He thong da chuyen khoan ${Number(result.request.approvedAmount || 0).toLocaleString()}d vao STK ${result.request.bankAccountSnapshot?.accountNumber || ''}.`,
                actionUrl: `/admin/finance/${result.request.projectId}`,
                entityType: 'disbursement_request',
                entityId: String(result.request._id),
                metadata
            });

            await this._emitSystemNotification({
                recipientIds: [String(result.request.organizerId)],
                title: 'Giai ngan thanh cong',
                message: `He thong da chuyen khoan ${Number(result.request.approvedAmount || 0).toLocaleString()}d vao STK ${result.request.bankAccountSnapshot?.accountNumber || ''}.`,
                actionUrl: `/projects/${result.request.projectId}?tab=milestones`,
                entityType: 'disbursement_request',
                entityId: String(result.request._id),
                metadata
            });
        }

        return result;
    }

    async failManualTransfer(requestId, adminId, payload) {
        const { reason } = payload;
        if (!reason) {
            throw new AppError('Thieu ly do fail transfer', 400);
        }

        const request = await this.transactionManager.runInTransaction(async (session) => {
            const req = await this.disbursementRequestRepository.findById(requestId, session);
            if (!req) throw new AppError('Khong tim thay yeu cau', 404);
            if (req.status !== 'APPROVED_PENDING_TRANSFER') throw new AppError('Chi co the bao loi cho cac yeu cau dang cho chuyen khoan', 400);

            const heldRequest = await this.disbursementRequestRepository.updateStatusWithPayload(requestId, 'HOLD', {}, session);

            const accounts = await this.bankAccountRepository.findByAccountNumber(req.bankAccountSnapshot.accountNumber, req.bankAccountSnapshot.bankName);
            const targetAcc = accounts.find(a => String(a.userId) === String(req.organizerId));

            if (targetAcc) await this.bankAccountRepository.updateById(targetAcc._id, { status: BANK_ACCOUNT_STATUS.FLAGGED }, session);

            return heldRequest || req;
        });

        await this._publishStatusUpdate(requestId, 'HOLD', { reason });

        const metadata = this._buildDisbursementMetadata(
            request,
            'disbursement_status_changed',
            { status: 'HOLD', reason }
        );

        await this._emitSystemNotification({
            recipientIds: ['ADMIN_GROUP'],
            title: 'Giai ngan that bai',
            message: `Qua trinh chuyen khoan bi loi. Ly do: ${reason}.`,
            actionUrl: `/admin/finance/${request.projectId}`,
            entityType: 'disbursement_request',
            entityId: String(request._id),
            metadata
        });

        await this._emitSystemNotification({
            recipientIds: [String(request.organizerId)],
            title: 'Giai ngan that bai',
            message: `Qua trinh chuyen khoan bi loi. Ly do: ${reason}.`,
            actionUrl: `/projects/${request.projectId}?tab=milestones`,
            entityType: 'disbursement_request',
            entityId: String(request._id),
            metadata
        });

        return request;
    }
    async updateHoldRequestBankAccount(requestId, organizerId, payload) {
        const updatedRequest = await this.transactionManager.runInTransaction(async (session) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('KhÃ´ng tÃ¬m tháº¥y yÃªu cáº§u', 404);
            if (String(request.organizerId) !== String(organizerId)) throw new AppError('KhÃ´ng cÃ³ quyá»n', 403);
            if (request.status !== 'HOLD') throw new AppError('Chá»‰ cÃ³ thá»ƒ cáº­p nháº­t tÃ i khoáº£n má»›i cho yÃªu cáº§u Ä‘ang bá»‹ lá»—i Káº¿ toÃ¡n (Tráº¡ng thÃ¡i HOLD)', 400);

            const bankAccount = await this.bankAccountRepository.findById(payload.bankAccountId);
            if (!bankAccount || String(bankAccount.userId) !== String(organizerId)) throw new AppError('TÃ i khoáº£n ngÃ¢n hÃ ng khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng há»£p lá»‡', 400);
            if (bankAccount.status !== 'ACTIVE' || !bankAccount.isVerified) throw new AppError('Vui lÃ²ng chá»n TÃ i khoáº£n ngÃ¢n hÃ ng Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c thá»±c Micro-deposit vÃ  Ä‘ang ACTIVE', 400);

            let bin = bankAccount.bin;
            if (!bin) {
                const bankInfo = getBankByShortName(bankAccount.bankName);
                if (!bankInfo) throw new AppError('NgÃ¢n hÃ ng khÃ´ng Ä‘Æ°á»£c há»— trá»£', 400);
                bin = bankInfo.bin;
            }

            const snapshot = {
                bankName: bankAccount.bankName,
                accountNumber: bankAccount.accountNumber,
                accountName: bankAccount.accountName,
                bin: bin
            };

            const updatedReq = await this.disbursementRequestRepository.updateStatusWithPayload(
                requestId, 'APPROVED_PENDING_TRANSFER', { bankAccountSnapshot: snapshot }, session
            );

            return updatedReq;
        });

        await this._publishStatusUpdate(requestId, 'APPROVED_PENDING_TRANSFER');

        const metadata = this._buildDisbursementMetadata(
            updatedRequest,
            'disbursement_status_changed',
            { status: 'APPROVED_PENDING_TRANSFER' }
        );

        await this._emitSystemNotification({
            recipientIds: ['ADMIN_GROUP'],
            title: 'Organizer da cap nhat so tai khoan moi',
            message: `Yeu cau giai ngan bi HOLD da co so tai khoan moi (${updatedRequest.bankAccountSnapshot?.accountNumber || ''}).`,
            actionUrl: `/admin/finance/${updatedRequest.projectId}`,
            entityType: 'disbursement_request',
            entityId: String(updatedRequest._id),
            metadata
        });

        await this._emitSystemNotification({
            recipientIds: [String(updatedRequest.organizerId)],
            title: 'Organizer da cap nhat so tai khoan moi',
            message: `Yeu cau giai ngan bi HOLD da co so tai khoan moi (${updatedRequest.bankAccountSnapshot?.accountNumber || ''}).`,
            actionUrl: `/projects/${updatedRequest.projectId}?tab=milestones`,
            entityType: 'disbursement_request',
            entityId: String(updatedRequest._id),
            metadata
        });

        return updatedRequest;
    }

    async getAdminDisbursementList(query) {
        const { page = 1, limit = 10, status, projectId } = query;
        const skip = (page - 1) * limit;

        const { data, total } = await this.disbursementRequestRepository.findAndCountForAdmin({
            skip, limit, status, projectId
        });

        return {
            items: data,
            pagination: {
                totalItems: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                limit
            }
        };
    }
}

export default DisbursementService;




