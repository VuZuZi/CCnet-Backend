import AppError from '../../core/AppError.js';
import { MILESTONE_STATUS, PROJECT_TYPE } from '../project/project.constant.js';
import { BANK_ACCOUNT_STATUS } from '../bankAccount/bankAccount.constant.js';
import { DOMAIN_EVENTS } from '../../config/notification.js';

class DisbursementService {
    constructor({
        disbursementRequestRepository,
        projectRepository,
        escrowRepository,
        bankAccountRepository,
        transactionRepository,
        milestoneEvidenceRepository,
        transactionManager,
        eventBus,
        config
    }) {
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.projectRepository = projectRepository;
        this.escrowRepository = escrowRepository;
        this.bankAccountRepository = bankAccountRepository;
        this.transactionRepository = transactionRepository;
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.transactionManager = transactionManager;
        this.eventBus = eventBus;
        this.config = config;
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
            pagination: {
                total: result.total,
                page,
                limit,
                totalPages: Math.ceil(result.total / limit)
            }
        };
    }

    async getRequestDetail(requestId, userId, userRole) {
        const request = await this.disbursementRequestRepository.findById(requestId);
        if (!request) throw new AppError('Yêu cầu giải ngân không tồn tại', 404);

        if (userRole === 'organizer' && String(request.organizerId) !== String(userId)) {
            throw new AppError('Bạn không có quyền xem chi tiết yêu cầu này', 403);
        }

        return request;
    }

    async createRequest(payload) {
        const { projectId, milestoneId, organizerId, requestedAmount } = payload;

        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('Dự án không tồn tại', 404);
        if (String(project.organizerId) !== String(organizerId)) {
            throw new AppError('Bạn không có quyền xin giải ngân cho dự án này', 403);
        }

        const escrow = await this.escrowRepository.findByProjectId(projectId);
        if (!escrow) throw new AppError('Không tìm thấy tài khoản Escrow của dự án', 404);

        if (requestedAmount > escrow.availableBalance) {
            throw new AppError(`Số tiền yêu cầu (${requestedAmount.toLocaleString()} đ) vượt quá số dư khả dụng thực tế của dự án (${escrow.availableBalance.toLocaleString()} đ).`, 400);
        }

        const milestones = project.milestones;
        const currentIdx = milestones.findIndex(m => m.milestoneId === milestoneId);
        const milestone = milestones[currentIdx];

        if (!milestone) throw new AppError('Mốc thời gian không tồn tại', 404);
        if (milestone.status !== MILESTONE_STATUS.PENDING) {
            throw new AppError(`Mốc này không ở trạng thái PENDING (Hiện tại: ${milestone.status})`, 400);
        }

        if (milestone.startDate) {
            const now = new Date();
            const start = new Date(milestone.startDate);
            const diffTime = start.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 3) {
                throw new AppError(`Chưa đến hạn! Chỉ được xin giải ngân tối đa 3 ngày trước ngày khởi công mốc (${start.toLocaleDateString('vi-VN')}).`, 400);
            }
        }

        const activeRequest = await this.disbursementRequestRepository.findActiveRequestByMilestone(projectId, milestoneId);
        if (activeRequest) {
            throw new AppError('Đang có một yêu cầu giải ngân chờ xử lý cho mốc này', 409);
        }

        let unspentFromPrevious = 0;
        if (currentIdx > 0) {
            const prevMilestone = milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) {
                throw new AppError('Bạn phải hoàn thành nghiệm thu mốc liền trước đó trước khi xin giải ngân mới.', 400);
            }

            const previousEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(projectId, prevMilestone.milestoneId);
            if (previousEvidence && previousEvidence.financialReport) {
                unspentFromPrevious = previousEvidence.financialReport.unspentAmount || 0;
            }
        }

        const maxAllowableAmount = Math.max(0, milestone.targetAmount - unspentFromPrevious);

        if (requestedAmount > maxAllowableAmount) {
            throw new AppError(`Vượt định mức! Ngân sách mốc: ${milestone.targetAmount.toLocaleString()} đ. Khấu trừ dư mốc trước: ${unspentFromPrevious.toLocaleString()} đ. Tối đa được xin: ${maxAllowableAmount.toLocaleString()} đ.`, 400);
        }

        if (requestedAmount === 0 && maxAllowableAmount === 0 && milestone.targetAmount === 0 && unspentFromPrevious === 0) {
            throw new AppError(`Mốc này không có dự toán và bạn không có tiền dư. Không cần lập phiếu giải ngân. Hãy tiến hành thực thi và nộp bằng chứng nghiệm thu bình thường.`, 400);
        }

        const verifiedAccounts = await this.bankAccountRepository.findVerifiedByUserId(organizerId);
        if (!verifiedAccounts || verifiedAccounts.length === 0) {
            throw new AppError('Bạn chưa có Tài khoản ngân hàng nào được xác thực để nhận tiền.', 400);
        }
        const activeBank = verifiedAccounts[0];

        const requestData = {
            projectId,
            milestoneId,
            organizerId,
            requestedAmount,
            bankAccountSnapshot: {
                bankName: activeBank.bankName,
                accountNumber: activeBank.accountNumber,
                accountName: activeBank.accountName,
                bin: activeBank.bin
            },
            requiredApprovals: requestedAmount > 50000000 ? 2 : 1,
            status: 'PENDING'
        };

        return await this.disbursementRequestRepository.create(requestData);
    }

    async processApproval(requestId, managerId, payload) {
        const { decision, note } = payload;

        const request = await this.disbursementRequestRepository.findById(requestId);
        if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);
        if (!['PENDING', 'PARTIALLY_APPROVED'].includes(request.status)) {
            throw new AppError('Trạng thái yêu cầu không hợp lệ để duyệt', 400);
        }

        const alreadyApproved = request.approvals.some(a => String(a.managerId) === String(managerId));
        if (alreadyApproved) throw new AppError('Bạn đã duyệt yêu cầu này rồi', 400);

        let nextStatus = request.status;
        const currentApprovalCount = request.approvals.length + 1;

        if (decision === 'REJECTED') {
            nextStatus = 'REJECTED';
        } else if (decision === 'HOLD') {
            nextStatus = 'HOLD';
        } else if (decision === 'APPROVED') {
            if (currentApprovalCount >= request.requiredApprovals) {
                if (request.requestedAmount === 0) {
                    nextStatus = 'COMPLETED';
                } else {
                    nextStatus = 'APPROVED_PENDING_TRANSFER';
                }
            } else {
                nextStatus = 'PARTIALLY_APPROVED';
            }
        }

        return await this.transactionManager.runInTransaction(async (session) => {
            const updatedRequest = await this.disbursementRequestRepository.addApproval(
                requestId,
                { managerId, decision, note },
                nextStatus,
                session
            );

            if (['APPROVED_PENDING_TRANSFER', 'COMPLETED'].includes(nextStatus)) {
                await this.disbursementRequestRepository.updateStatus(requestId, nextStatus, session);
                await this.disbursementRequestRepository.updateById(requestId, { approvedAmount: request.requestedAmount }, session);
            }

            if (nextStatus === 'APPROVED_PENDING_TRANSFER') {
                const accounts = await this.bankAccountRepository.findByAccountNumber(request.bankAccountSnapshot.accountNumber, request.bankAccountSnapshot.bankName);
                const targetAcc = accounts.find(a => String(a.userId) === String(request.organizerId));
                if (targetAcc) {
                    await this.bankAccountRepository.updateById(targetAcc._id, { status: BANK_ACCOUNT_STATUS.LOCKED }, session);
                }
            }

            if (nextStatus === 'COMPLETED' && request.requestedAmount === 0) {
                await this.projectRepository.updateMilestoneStatus(request.projectId, request.milestoneId, MILESTONE_STATUS.PROCESSING, session);
            }

            return updatedRequest;
        });
    }

    async confirmManualTransfer(requestId, adminId, bankTransactionRef) {
        const request = await this.disbursementRequestRepository.findById(requestId);

        if (!request) throw new AppError('Không tìm thấy yêu cầu giải ngân', 404);
        if (request.status !== 'APPROVED_PENDING_TRANSFER') {
            throw new AppError('Yêu cầu này chưa sẵn sàng để chuyển khoản', 400);
        }

        const amountToDisburse = request.approvedAmount !== undefined ? request.approvedAmount : request.requestedAmount;

        return await this.transactionManager.runInTransaction(async (session) => {

            const escrowUpdate = await this.escrowRepository.recordDisbursement(
                request.projectId,
                amountToDisburse,
                session
            );

            if (!escrowUpdate) {
                throw new AppError('Xung đột tài chính: Số dư Escrow khả dụng không đủ để hoàn tất giải ngân. Giao dịch đã bị huỷ để bảo toàn quỹ.', 409);
            }

            const completedRequest = await this.disbursementRequestRepository.markAsTransferred(
                requestId,
                bankTransactionRef,
                adminId,
                session
            );

            const transactionLog = {
                type: 'DISBURSEMENT',
                amount: amountToDisburse,
                netAmount: amountToDisburse,
                currency: 'VND',
                projectId: request.projectId,
                donorRef: request.organizerId,
                bankTransactionRef: bankTransactionRef,
                status: 'COMPLETED',
                message: `Giải ngân Mốc ${request.milestoneId} cho dự án ${request.projectId}`
            };
            await this.transactionRepository.create(transactionLog, session);

            await this.projectRepository.updateMilestoneStatus(request.projectId, request.milestoneId, MILESTONE_STATUS.PROCESSING, session);

            const accounts = await this.bankAccountRepository.findByAccountNumber(request.bankAccountSnapshot.accountNumber, request.bankAccountSnapshot.bankName);
            const targetAcc = accounts.find(a => String(a.userId) === String(request.organizerId));
            if (targetAcc) {
                await this.bankAccountRepository.updateById(targetAcc._id, { status: BANK_ACCOUNT_STATUS.ACTIVE }, session);
            }

            if (this.eventBus) {
                this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(request.organizerId)],
                    title: 'Giải ngân thành công',
                    message: `Tiền giải ngân (${amountToDisburse.toLocaleString()} VNĐ) cho Mốc ${request.milestoneId} đã được chuyển vào tài khoản ngân hàng của bạn.`
                });
            }

            return completedRequest;
        });
    }

    async failManualTransfer(requestId, adminId, reason) {
        const request = await this.disbursementRequestRepository.findById(requestId);
        if (request.status !== 'APPROVED_PENDING_TRANSFER') {
            throw new AppError('Chỉ có thể báo lỗi cho các yêu cầu đang chờ chuyển khoản', 400);
        }

        return await this.transactionManager.runInTransaction(async (session) => {
            const updatedRequest = await this.disbursementRequestRepository.updateStatus(requestId, 'HOLD', session);

            const accounts = await this.bankAccountRepository.findByAccountNumber(request.bankAccountSnapshot.accountNumber, request.bankAccountSnapshot.bankName);
            const targetAcc = accounts.find(a => String(a.userId) === String(request.organizerId));
            if (targetAcc) {
                await this.bankAccountRepository.updateById(targetAcc._id, { status: BANK_ACCOUNT_STATUS.FLAGGED }, session);
            }

            if (this.eventBus) {
                this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(request.organizerId)],
                    title: 'Giải ngân thất bại (Lỗi Ngân hàng)',
                    message: `Quá trình chuyển khoản cho Mốc ${request.milestoneId} bị lỗi. Lý do: ${reason}. Tài khoản ngân hàng của bạn đã bị gắn cờ. Vui lòng cập nhật tài khoản mới.`
                });
            }

            return updatedRequest;
        });
    }
}

export default DisbursementService;