import AppError from '../../core/AppError.js';
import MoneyMath from '../../core/MoneyMath.js';
import { MILESTONE_STATUS, PROJECT_TYPE } from '../project/project.constant.js';
import { BANK_ACCOUNT_STATUS, getBankByShortName } from '../bankAccount/bankAccount.constant.js';
import { DOMAIN_EVENTS } from '../../config/notification.js';
import { TRANSACTION_TYPES } from '../transaction/transaction.constant.js';

class DisbursementService {
    constructor({
        disbursementRequestRepository,
        projectRepository,
        escrowRepository,
        bankAccountRepository,
        transactionRepository,
        milestoneEvidenceRepository,
        transactionManager,
        redis
    }) {
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.projectRepository = projectRepository;
        this.escrowRepository = escrowRepository;
        this.bankAccountRepository = bankAccountRepository;
        this.transactionRepository = transactionRepository;
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.transactionManager = transactionManager;
        this.redis = redis;
    }

    /**
     * Helper: Đẩy dữ liệu trạng thái sang Redis để SSE Service bốc máy gửi cho FE
     * @private
     */
    async _publishStatusUpdate(requestId, status, payload = {}) {
        try {
            const redisClient = this.redis.getClient();
            const message = JSON.stringify({
                requestId,
                status,
                ...payload,
                updatedAt: new Date()
            });
            // Channel format chuẩn Enterprise: domain:id:field
            await redisClient.publish(`disbursement_status:${requestId}`, message);
        } catch (err) {
            console.error(`[Redis PubSub] Disbursement Publish Error (${requestId}):`, err.message);
        }
    }

    _normalizeAccountName(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .toUpperCase()
            .trim();
    }

    _generateVietQRData(request) {
        const snapshot = request.bankAccountSnapshot;

        if (!snapshot || !snapshot.bin || !snapshot.accountNumber) {
            throw new AppError('[Critical]: Dữ liệu Snapshot Ngân hàng bị thiếu mã BIN hoặc Số tài khoản. Không thể sinh mã VietQR.', 500);
        }

        const bin = snapshot.bin;
        const accNo = snapshot.accountNumber;
        const amount = request.approvedAmount;
        const transferMemo = `GN ${request._id}`;

        const normalizedAccName = this._normalizeAccountName(snapshot.accountName);

        const qrUrl = `https://img.vietqr.io/image/${bin}-${accNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(normalizedAccName)}`;

        return { transferMemo, qrUrl };
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
        if (!request) throw new AppError('Không tìm thấy yêu cầu giải ngân', 404);

        const isOwner = String(request.organizerId) === String(userId);
        const isPrivileged = ['admin', 'manager'].includes(role);

        if (!isOwner && !isPrivileged) throw new AppError('Bạn không có quyền xem chi tiết yêu cầu này', 403);

        const result = { request };

        if (request.status === 'APPROVED_PENDING_TRANSFER' && isPrivileged) {
            result.paymentInfo = this._generateVietQRData(request);
        }

        return result;
    }

    async createRequest(organizerId, payload) {
        const { projectId, milestoneId } = payload;

        const project = await this.projectRepository.findById(projectId);
        if (!project || String(project.organizerId) !== String(organizerId)) throw new AppError('Dự án không tồn tại hoặc bạn không có quyền', 404);
        if (project.projectType !== PROJECT_TYPE.FUNDED) throw new AppError('Chỉ dự án FUNDED mới được phép xin giải ngân', 400);

        const milestone = project.milestones.find(m => m.milestoneId === milestoneId);
        if (!milestone) throw new AppError('Không tìm thấy Mốc giải ngân', 404);

        const currentIdx = project.milestones.findIndex(m => m.milestoneId === milestoneId);
        if (currentIdx > 0) {
            const prevMilestone = project.milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) throw new AppError('Mốc trước đó chưa nghiệm thu xong, không thể giải ngân cuốn chiếu', 400);
        }

        const activeRequest = await this.disbursementRequestRepository.findActiveRequestByMilestone(projectId, milestoneId);
        if (activeRequest) throw new AppError('Đang có một yêu cầu giải ngân chưa hoàn tất cho Mốc này', 400);

        let unspentFromPrevious = 0;
        if (currentIdx > 0) {
            const prevMilestone = project.milestones[currentIdx - 1];
            const prevEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(projectId, prevMilestone.milestoneId);
            if (prevEvidence && prevEvidence.financialReport) unspentFromPrevious = prevEvidence.financialReport.unspentAmount || 0;
        }

        let requestedAmount = MoneyMath.subtract(milestone.targetAmount, unspentFromPrevious);
        if (requestedAmount < 0) requestedAmount = 0;

        if (requestedAmount === 0) {
            throw new AppError('Số tiền dư từ mốc trước đã đủ để thực hiện mốc này, không cần giải ngân thêm.', 400);
        }

        const escrow = await this.escrowRepository.findByProjectId(projectId);
        if (!escrow || escrow.availableBalance < requestedAmount) throw new AppError(`Số dư khả dụng trong Escrow (${escrow?.availableBalance || 0}đ) không đủ để giải ngân`, 400);

        const accounts = await this.bankAccountRepository.findVerifiedByUserId(organizerId);
        if (!accounts || accounts.length === 0) throw new AppError('Bạn chưa có tài khoản ngân hàng nào được xác thực và đang ACTIVE', 400);

        const activeBank = accounts[0];

        let bin = activeBank.bin;
        if (!bin) {
            const bankInfo = getBankByShortName(activeBank.bankName);
            if (!bankInfo) {
                throw new AppError(`Tài khoản ngân hàng (${activeBank.bankName}) không được hỗ trợ. Vui lòng thêm tài khoản ngân hàng mới.`, 400);
            }
            bin = bankInfo.bin;
        }

        const requiredApprovals = 1;

        const snapshot = {
            bankName: activeBank.bankName,
            accountNumber: activeBank.accountNumber,
            accountName: activeBank.accountName,
            bin: bin
        };

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const escrowUpdated = await this.escrowRepository.reserveDisbursement(projectId, requestedAmount, session);
            if (!escrowUpdated) throw new AppError('Xung đột số dư Escrow.', 409);

            const newRequest = await this.disbursementRequestRepository.create({
                projectId, milestoneId, organizerId, requestedAmount, requiredApprovals, bankAccountSnapshot: snapshot, status: 'PENDING'
            }, session);

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: ['ADMIN_GROUP'],
                title: 'Yêu cầu giải ngân mới',
                message: `Dự án ${project.title} vừa xin giải ngân ${requestedAmount.toLocaleString()}đ cho mốc ${milestone.title}`
            });

            return newRequest;
        });
    }

    async processApproval(requestId, managerId, payload) {
        const { decision, note } = payload;

        const result = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);
            if (request.status !== 'PENDING') throw new AppError(`Không thể duyệt yêu cầu đang ở trạng thái: ${request.status}`, 400);

            const hasApproved = request.approvals.some(a => String(a.managerId) === String(managerId));
            if (hasApproved) throw new AppError('Bạn đã ký duyệt yêu cầu này rồi (COI Enforcement)', 403);

            const newApproval = { managerId, decision, note, approvedAt: new Date() };

            const pushedRequest = await this.disbursementRequestRepository.addApprovalAtomic(
                requestId, managerId, newApproval, session
            );

            if (!pushedRequest) throw new AppError('Xung đột dữ liệu. Có thể một Admin khác đã duyệt hoặc yêu cầu đã thay đổi trạng thái.', 409);

            const approvedCount = pushedRequest.approvals.filter(a => a.decision === 'APPROVED').length;

            let newStatus = 'PENDING';
            let extraPayload = {};
            let qrData = null;

            if (decision === 'REJECTED') {
                newStatus = 'REJECTED';
                await this.escrowRepository.releaseDisbursement(pushedRequest.projectId, pushedRequest.requestedAmount, session);
            } else if (decision === 'HOLD') {
                newStatus = 'HOLD';
            } else if (decision === 'APPROVED') {
                if (approvedCount >= pushedRequest.requiredApprovals) {
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
                dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(finalRequest.organizerId)],
                    title: 'Yêu cầu giải ngân đã được duyệt',
                    message: `Yêu cầu giải ngân ${finalRequest.approvedAmount.toLocaleString()}đ của bạn đã được duyệt và đang chờ kế toán chuyển khoản.`
                });
            } else if (['REJECTED', 'HOLD'].includes(newStatus)) {
                dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(finalRequest.organizerId)],
                    title: `Yêu cầu giải ngân bị ${newStatus}`,
                    message: `Lý do: ${note || 'Vui lòng kiểm tra lại hồ sơ'}`
                });
            }

            return { request: finalRequest, paymentInfo: qrData };
        });

        if (result.request) {
            await this._publishStatusUpdate(requestId, result.request.status, {
                approvedAmount: result.request.approvedAmount
            });
        }
        return result;
    }

    async confirmAutoTransfer(requestId, bankTransactionRef, transferredAmount) {
        let finalStatus = null;

        const success = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            
            // 1. Kiểm tra trạng thái và điều kiện chốt đơn
            if (!request || request.status !== 'APPROVED_PENDING_TRANSFER') {
                console.warn(`[Disbursement Auto] Request ${requestId} không hợp lệ hoặc không ở trạng thái chờ.`);
                return false;
            }

            // 2. Thuật toán Strict Exact Match: Chống Kế toán chuyển lệch tiền
            if (transferredAmount !== request.approvedAmount) {
                const isOverTransfer = transferredAmount > request.approvedAmount;
                console.error(`[Disbursement Auto] 🛑 CẢNH BÁO ĐỎ: Kế toán chuyển ${isOverTransfer ? 'DƯ' : 'THIẾU'} tiền (Chuyển: ${transferredAmount}đ, Yêu cầu: ${request.approvedAmount}đ).`);

                await this.disbursementRequestRepository.updateStatusWithPayload(requestId, 'HOLD', {
                    reviewNotes: `Chuyển lệch tiền: Nhận ${transferredAmount.toLocaleString()}đ (Yêu cầu: ${request.approvedAmount.toLocaleString()}đ)`
                }, session);
                
                dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: ['ADMIN_GROUP'],
                    title: `🚨 BÁO ĐỘNG: Chuyển ${isOverTransfer ? 'DƯ' : 'THIẾU'} tiền Giải ngân`,
                    message: `Hệ thống ghi nhận kế toán chuyển ${isOverTransfer ? 'DƯ' : 'THIẾU'} tiền cho Request ID: ${requestId} (Thực tế: ${transferredAmount.toLocaleString()}đ so với Yêu cầu: ${request.approvedAmount.toLocaleString()}đ). Giao dịch đã bị đóng băng (HOLD).`
                });
                
                finalStatus = 'HOLD';
                return false;
            }

            // 3. Thực thi ACID: Trừ Escrow -> Tạo Ledger -> Cập nhật Milestone
            await this.escrowRepository.commitDisbursement(request.projectId, request.approvedAmount, session);
            
            await this.disbursementRequestRepository.markAsTransferredAtomic(requestId, bankTransactionRef, null, session);
            
            await this.transactionRepository.create({
                type: TRANSACTION_TYPES.DISBURSEMENT,
                amount: request.approvedAmount,
                netAmount: request.approvedAmount,
                currency: 'VND',
                projectId: request.projectId,
                organizerRef: request.organizerId,
                gatewayTransactionId: bankTransactionRef,
                status: 'COMPLETED',
                reconciled: false
            }, session);

            // 🛠 FIX CRITICAL: Chỉ truyền đúng 4 tham số
            await this.projectRepository.incrementMilestoneDisbursed(
                request.projectId,
                request.milestoneId,
                request.approvedAmount,
                session
            );

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(request.organizerId)],
                title: 'Giải ngân tự động thành công',
                message: `Hệ thống vừa đối soát và ghi nhận khoản tiền ${request.approvedAmount.toLocaleString()}đ đã tới STK ${request.bankAccountSnapshot.accountNumber} của bạn.`
            });

            console.log(`[Disbursement Auto] Đã chốt sổ tự động thành công Request ${requestId}`);
            
            finalStatus = 'COMPLETED';
            return true;
        });

        // 🚀 4. Phát sóng trạng thái mới: Ting ting hoặc Cảnh báo (Phải nằm ngoài transaction)
        if (finalStatus) {
            await this._publishStatusUpdate(requestId, finalStatus, {
                transferredAmount: transferredAmount,
                bankTransactionRef
            });
        }

        return success;
    }

    async confirmManualTransfer(requestId, adminId, payload) {
        const result = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);
            if (request.status !== 'APPROVED_PENDING_TRANSFER') throw new AppError('Chỉ có thể xác nhận chuyển khoản cho yêu cầu đã duyệt xong', 400);

            await this.escrowRepository.commitDisbursement(request.projectId, request.approvedAmount, session);
            await this.disbursementRequestRepository.markAsTransferredAtomic(requestId, payload.bankTransactionRef, adminId, session);

            await this.transactionRepository.create({
                type: TRANSACTION_TYPES.DISBURSEMENT, amount: request.approvedAmount, netAmount: request.approvedAmount,
                currency: 'VND', projectId: request.projectId, organizerRef: request.organizerId,
                gatewayTransactionId: payload.bankTransactionRef, status: 'COMPLETED', reconciled: false
            }, session);

            // 🛠 FIX CRITICAL: Chỉ truyền đúng 4 tham số
            await this.projectRepository.incrementMilestoneDisbursed(
                request.projectId,
                request.milestoneId,
                request.approvedAmount,
                session
            );

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(request.organizerId)],
                title: 'Giải ngân thành công',
                message: `Hệ thống đã chuyển khoản ${request.approvedAmount.toLocaleString()}đ vào STK ${request.bankAccountSnapshot.accountNumber}. Vui lòng kiểm tra ứng dụng ngân hàng.`
            });

            return { success: true, message: 'Xác nhận chuyển khoản bằng tay thành công' };
        });

        await this._publishStatusUpdate(requestId, 'COMPLETED');
        return result;
    }

    async failManualTransfer(requestId, adminId, payload) {
        const { reason } = payload;
        const request = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const req = await this.disbursementRequestRepository.findById(requestId, session);
            if (!req) throw new AppError('Không tìm thấy yêu cầu', 404);
            if (req.status !== 'APPROVED_PENDING_TRANSFER') throw new AppError('Chỉ có thể báo lỗi cho các yêu cầu đang chờ chuyển khoản', 400);

            await this.disbursementRequestRepository.updateStatusWithPayload(requestId, 'HOLD', {}, session);

            const accounts = await this.bankAccountRepository.findByAccountNumber(req.bankAccountSnapshot.accountNumber, req.bankAccountSnapshot.bankName);
            const targetAcc = accounts.find(a => String(a.userId) === String(req.organizerId));

            if (targetAcc) await this.bankAccountRepository.updateById(targetAcc._id, { status: BANK_ACCOUNT_STATUS.FLAGGED }, session);

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(req.organizerId)],
                title: 'Giải ngân thất bại (Lỗi Ngân hàng)',
                message: `Quá trình chuyển khoản bị lỗi. Lý do: ${reason}. Tài khoản ngân hàng của bạn đã bị khóa. Vui lòng cập nhật tài khoản mới để nhận tiền.`
            });

            return req;
        });

        await this._publishStatusUpdate(requestId, 'HOLD', { reason: payload.reason });
        return request;
    }

    async updateHoldRequestBankAccount(requestId, organizerId, payload) {
        const updatedRequest = await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);
            if (String(request.organizerId) !== String(organizerId)) throw new AppError('Không có quyền', 403);
            if (request.status !== 'HOLD') throw new AppError('Chỉ có thể cập nhật tài khoản mới cho yêu cầu đang bị lỗi Kế toán (Trạng thái HOLD)', 400);

            const bankAccount = await this.bankAccountRepository.findById(payload.bankAccountId);
            if (!bankAccount || String(bankAccount.userId) !== String(organizerId)) throw new AppError('Tài khoản ngân hàng không tồn tại hoặc không hợp lệ', 400);
            if (bankAccount.status !== 'ACTIVE' || !bankAccount.isVerified) throw new AppError('Vui lòng chọn Tài khoản ngân hàng đã được xác thực Micro-deposit và đang ACTIVE', 400);

            let bin = bankAccount.bin;
            if (!bin) {
                const bankInfo = getBankByShortName(bankAccount.bankName);
                if (!bankInfo) throw new AppError('Ngân hàng không được hỗ trợ', 400);
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

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: ['ADMIN_GROUP'], title: 'Organizer đã cập nhật số tài khoản mới',
                message: `Yêu cầu giải ngân bị lỗi trước đó đã có số tài khoản mới (${snapshot.accountNumber}). Vui lòng quét lại QR code để chuyển tiền.`
            });

            return updatedReq;
        });

        await this._publishStatusUpdate(requestId, 'APPROVED_PENDING_TRANSFER');
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