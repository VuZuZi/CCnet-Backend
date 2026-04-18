import AppError from '../../core/AppError.js';
import MoneyMath from '../../core/MoneyMath.js';
import { MILESTONE_STATUS, PROJECT_TYPE } from '../project/project.constant.js';
import { BANK_ACCOUNT_STATUS } from '../bankAccount/bankAccount.constant.js';
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
        transactionManager
    }) {
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.projectRepository = projectRepository;
        this.escrowRepository = escrowRepository;
        this.bankAccountRepository = bankAccountRepository;
        this.transactionRepository = transactionRepository;
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.transactionManager = transactionManager;
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

    async createRequest(organizerId, payload) {
        const { projectId, milestoneId, requestedAmount } = payload;

        const project = await this.projectRepository.findById(projectId);
        if (!project || String(project.organizerId) !== String(organizerId)) {
            throw new AppError('Dự án không tồn tại hoặc bạn không có quyền', 404);
        }

        if (project.projectType !== PROJECT_TYPE.FUNDED) {
            throw new AppError('Chỉ dự án FUNDED mới được phép xin giải ngân', 400);
        }

        const milestone = project.milestones.find(m => m.milestoneId === milestoneId);
        if (!milestone) throw new AppError('Không tìm thấy Mốc giải ngân', 404);

        const currentIdx = project.milestones.findIndex(m => m.milestoneId === milestoneId);
        if (currentIdx > 0) {
            const prevMilestone = project.milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) {
                throw new AppError('Mốc trước đó chưa nghiệm thu xong, không thể giải ngân cuốn chiếu', 400);
            }
        }

        const activeRequest = await this.disbursementRequestRepository.findActiveRequestByMilestone(projectId, milestoneId);
        if (activeRequest) {
            throw new AppError('Đang có một yêu cầu giải ngân chưa hoàn tất cho Mốc này', 400);
        }

        const escrow = await this.escrowRepository.findByProjectId(projectId);
        if (!escrow || escrow.availableBalance < requestedAmount) {
            throw new AppError(`Số dư khả dụng trong Escrow (${escrow?.availableBalance || 0}đ) không đủ để giải ngân`, 400);
        }

        const accounts = await this.bankAccountRepository.findVerifiedByUserId(organizerId);
        if (!accounts || accounts.length === 0) {
            throw new AppError('Bạn chưa có tài khoản ngân hàng nào được xác thực và đang ACTIVE', 400);
        }
        const activeBank = accounts[0];

        let unspentFromPrevious = 0;
        if (currentIdx > 0) {
            const prevMilestone = project.milestones[currentIdx - 1];
            const prevEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(projectId, prevMilestone.milestoneId);
            if (prevEvidence && prevEvidence.financialReport) {
                unspentFromPrevious = prevEvidence.financialReport.unspentAmount || 0;
            }
        }

        let maxAllowableAmount = MoneyMath.subtract(milestone.targetAmount, unspentFromPrevious);
        if (maxAllowableAmount < 0) maxAllowableAmount = 0;

        if (requestedAmount > maxAllowableAmount) {
            throw new AppError(`Số tiền yêu cầu vượt quá hạn mức tối đa cho phép của Mốc này (${maxAllowableAmount}đ)`, 400);
        }

        let requiredApprovals = 1;
        if (requestedAmount >= 50000000) requiredApprovals = 3;
        else if (requestedAmount >= 10000000) requiredApprovals = 2;

        const snapshot = {
            bankName: activeBank.bankName,
            accountNumber: activeBank.accountNumber,
            accountName: activeBank.accountName
        };

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const newRequest = await this.disbursementRequestRepository.create({
                projectId,
                milestoneId,
                organizerId,
                requestedAmount,
                requiredApprovals,
                bankAccountSnapshot: snapshot,
                status: 'PENDING'
            }, session);

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: ['ADMIN_GROUP'],
                title: 'Yêu cầu giải ngân mới',
                message: `Dự án ${project.title} vừa xin giải ngân ${requestedAmount}đ cho mốc ${milestone.title}`
            });

            return newRequest;
        });
    }

    async processApproval(requestId, managerId, payload) {
        const { decision, approvedAmount, note } = payload;

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);

            if (!['PENDING', 'PARTIALLY_APPROVED'].includes(request.status)) {
                throw new AppError(`Không thể duyệt yêu cầu đang ở trạng thái: ${request.status}`, 400);
            }

            const hasApproved = request.approvals.some(a => String(a.managerId) === String(managerId));
            if (hasApproved) {
                throw new AppError('Bạn đã ký duyệt yêu cầu này rồi (COI Enforcement)', 403);
            }

            request.approvals.push({ managerId, decision, note, approvedAt: new Date() });

            if (decision === 'REJECTED') {
                request.status = 'REJECTED';
            } else if (decision === 'HOLD') {
                request.status = 'HOLD';
            } else if (decision === 'APPROVED') {
                const approvedCount = request.approvals.filter(a => a.decision === 'APPROVED').length;

                if (approvedCount >= request.requiredApprovals) {
                    request.status = 'APPROVED_PENDING_TRANSFER';

                    const actualApprovedAmount = approvedAmount !== undefined ? approvedAmount : request.requestedAmount;
                    request.approvedAmount = actualApprovedAmount;

                    if (actualApprovedAmount < request.requestedAmount) {
                        request.disputedAmount = MoneyMath.subtract(request.requestedAmount, actualApprovedAmount);
                        request.disputedAmountStatus = 'PENDING_RESUBMIT';
                    } else {
                        request.disputedAmount = 0;
                    }
                } else {
                    request.status = 'PARTIALLY_APPROVED';
                }
            }

            await request.save({ session });

            if (request.status === 'APPROVED_PENDING_TRANSFER') {
                dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(request.organizerId)],
                    title: 'Yêu cầu giải ngân đã được duyệt',
                    message: `Yêu cầu giải ngân ${request.approvedAmount}đ của bạn đã được duyệt và đang chờ kế toán chuyển khoản.`
                });
            } else if (['REJECTED', 'HOLD'].includes(request.status)) {
                dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(request.organizerId)],
                    title: `Yêu cầu giải ngân bị ${request.status}`,
                    message: `Lý do: ${note || 'Vui lòng kiểm tra lại hồ sơ'}`
                });
            }

            return request;
        });
    }

    async confirmManualTransfer(requestId, adminId, payload) {
        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);

            if (request.status !== 'APPROVED_PENDING_TRANSFER') {
                throw new AppError('Chỉ có thể xác nhận chuyển khoản cho yêu cầu đã duyệt xong (APPROVED_PENDING_TRANSFER)', 400);
            }

            if (!request.approvedAmount || request.approvedAmount <= 0) {
                throw new AppError('[Critical Error]: Số tiền duyệt giải ngân bằng 0 hoặc không hợp lệ. Vui lòng kiểm tra lại dữ liệu.', 500);
            }

            const escrow = await this.escrowRepository.findByProjectId(request.projectId, session);
            if (!escrow || escrow.availableBalance < request.approvedAmount) {
                throw new AppError('Quỹ Escrow không đủ tiền để thực hiện giao dịch này', 400);
            }

            await this.escrowRepository.releaseDisbursement(request.projectId, request.approvedAmount, session);

            await this.disbursementRequestRepository.markAsTransferredAtomic(
                requestId,
                payload.bankTransactionRef,
                adminId,
                session
            );

            await this.transactionRepository.create({
                type: TRANSACTION_TYPES.DISBURSEMENT,
                amount: request.approvedAmount,
                netAmount: request.approvedAmount,
                currency: 'VND',
                projectId: request.projectId,
                organizerRef: request.organizerId,
                gatewayTransactionId: payload.bankTransactionRef,
                status: 'COMPLETED',
                reconciled: false
            }, session);

            let nextMilestoneStatus = request.disputedAmount > 0 ? MILESTONE_STATUS.PARTIALLY_DISBURSED : MILESTONE_STATUS.PROCESSING;
            await this.projectRepository.incrementMilestoneDisbursed(
                request.projectId,
                request.milestoneId,
                request.approvedAmount,
                nextMilestoneStatus,
                session
            );

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(request.organizerId)],
                title: 'Giải ngân thành công',
                message: `Hệ thống đã chuyển khoản ${request.approvedAmount.toLocaleString()}đ vào STK ${request.bankAccountSnapshot.accountNumber}. Vui lòng kiểm tra ứng dụng ngân hàng.`
            });

            return { success: true, message: 'Xác nhận chuyển khoản và ghi sổ thành công' };
        });
    }

    async failManualTransfer(requestId, adminId, payload) {
        const { reason } = payload;

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);

            if (request.status !== 'APPROVED_PENDING_TRANSFER') {
                throw new AppError('Chỉ có thể báo lỗi cho các yêu cầu đang chờ chuyển khoản', 400);
            }

            request.status = 'HOLD';
            await request.save({ session });

            const accounts = await this.bankAccountRepository.findByAccountNumber(
                request.bankAccountSnapshot.accountNumber,
                request.bankAccountSnapshot.bankName
            );
            const targetAcc = accounts.find(a => String(a.userId) === String(request.organizerId));

            if (targetAcc) {
                await this.bankAccountRepository.updateById(targetAcc._id, { status: BANK_ACCOUNT_STATUS.FLAGGED }, session);
            }

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(request.organizerId)],
                title: 'Giải ngân thất bại (Lỗi Ngân hàng)',
                message: `Quá trình chuyển khoản bị lỗi. Lý do: ${reason}. Tài khoản ngân hàng của bạn đã bị khóa. Vui lòng cập nhật tài khoản mới để nhận tiền.`
            });

            return request;
        });
    }

    async updateHoldRequestBankAccount(requestId, organizerId, payload) {
        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const request = await this.disbursementRequestRepository.findById(requestId, session);
            if (!request) throw new AppError('Không tìm thấy yêu cầu', 404);
            if (String(request.organizerId) !== String(organizerId)) throw new AppError('Không có quyền', 403);

            if (request.status !== 'HOLD') {
                throw new AppError('Chỉ có thể cập nhật tài khoản mới cho yêu cầu đang bị lỗi Kế toán (Trạng thái HOLD)', 400);
            }

            const bankAccount = await this.bankAccountRepository.findById(payload.bankAccountId);
            if (!bankAccount || String(bankAccount.userId) !== String(organizerId)) {
                throw new AppError('Tài khoản ngân hàng không tồn tại hoặc không hợp lệ', 400);
            }
            if (bankAccount.status !== 'ACTIVE' || !bankAccount.isVerified) {
                throw new AppError('Vui lòng chọn Tài khoản ngân hàng đã được xác thực Micro-deposit và đang ACTIVE', 400);
            }

            const snapshot = {
                bankName: bankAccount.bankName,
                accountNumber: bankAccount.accountNumber,
                accountName: bankAccount.accountName
            };

            const updatedRequest = await this.disbursementRequestRepository.updateStatus(
                requestId,
                'APPROVED_PENDING_TRANSFER',
                { bankAccountSnapshot: snapshot },
                session
            );

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: ['ADMIN_GROUP'],
                title: 'Organizer đã cập nhật số tài khoản mới',
                message: `Yêu cầu giải ngân ${requestId} bị lỗi trước đó đã có số tài khoản mới (${snapshot.accountNumber}). Vui lòng tiến hành chuyển khoản lại.`
            });

            return updatedRequest;
        });
    }
}

export default DisbursementService;