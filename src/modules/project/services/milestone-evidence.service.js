import AppError from '../../../core/AppError.js';
import MoneyMath from '../../../core/MoneyMath.js';
import { MILESTONE_STATUS, PROJECT_STATUS, PROJECT_TYPE } from '../project.constant.js';
import { DOMAIN_EVENTS } from '../../../config/notification.js';

class MilestoneEvidenceService {
    constructor({
    milestoneEvidenceRepository,
    projectRepository,
    disbursementRequestRepository,
    mediaRepository,
    transactionManager,
    volunteerEngagementService
}) {
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.projectRepository = projectRepository;
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.mediaRepository = mediaRepository;
        this.transactionManager = transactionManager;
        this.volunteerEngagementService = volunteerEngagementService;
    }

    async _getPreviousUnspentAmount(projectId, milestones, currentIdx) {
        if (currentIdx <= 0) return 0;

        const prevMilestone = milestones[currentIdx - 1];
        const prevEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(projectId, prevMilestone.milestoneId);

        return prevEvidence?.financialReport?.unspentAmount || 0;
    }

    async _evaluateEvidencePayload(project, milestone, currentIdx, organizerId, financialReport, mediaIds) {
        if (project.projectType === PROJECT_TYPE.FUNDED) {
            const totalDisbursed = milestone.actualDisbursedAmount || 0;
            const previousUnspent = await this._getPreviousUnspentAmount(project._id, project.milestones, currentIdx);
            const totalAvailable = MoneyMath.add(totalDisbursed, previousUnspent);

            if (totalAvailable > 0) {
                if (!financialReport) throw new AppError('Bắt buộc phải có báo cáo tài chính để giải trình.', 400);

                const spentAmount = financialReport.spentAmount || 0;
                const unspentAmount = financialReport.unspentAmount || 0;
                const totalReported = MoneyMath.add(spentAmount, unspentAmount);

                if (!MoneyMath.isEqual(totalReported, totalAvailable)) {
                    throw new AppError(`Sai lệch kế toán. Tổng giải trình (${totalReported.toLocaleString()} đ) phải khớp với Số tiền khả dụng (${totalAvailable.toLocaleString()} đ).`, 400);
                }
            }
        }

        let geoVerifiedCount = 0;
        if (mediaIds && mediaIds.length > 0) {
            const targetLocation = milestone.location?.coordinates?.length === 2 ? milestone.location : project.location;
            if (targetLocation && targetLocation.coordinates) {
                const [mLong, mLat] = targetLocation.coordinates;
                geoVerifiedCount = await this.mediaRepository.countGeoVerifiedMedias(mediaIds, organizerId, mLong, mLat, 500);
            }
        }

        const policy = milestone.evidencePolicy || {
            requireFinancial: milestone.targetAmount > 0,
            requireGeoPhotos: milestone.targetAmount === 0 ? 1 : 0
        };

        let finalStatus = 'PENDING';
        let finalMilestoneStatus = MILESTONE_STATUS.PROCESSING;
        let reviewNotes = null;

        if (!policy.requireFinancial && policy.requireGeoPhotos > 0) {
            if (geoVerifiedCount >= policy.requireGeoPhotos) {
                finalStatus = 'APPROVED';
                finalMilestoneStatus = MILESTONE_STATUS.COMPLETED;
                reviewNotes = `[HỆ THỐNG AUTO-PASS] Xác thực thành công (${geoVerifiedCount}/${policy.requireGeoPhotos} ảnh hợp lệ) tại hiện trường.`;
            } else {
                reviewNotes = `[HỆ THỐNG GHI NHẬN] Organizer nộp ảnh nhưng không chứa EXIF GPS gốc hoặc nằm ngoài bán kính 500m. Cần kiểm tra thủ công.`;
            }
        }

        return { finalStatus, finalMilestoneStatus, reviewNotes, policy };
    }

    async submitEvidence(payload) {
        const { projectId, milestoneId, organizerId, mediaIds } = payload;
        const receiptMediaIds = payload.receiptMediaIds || []; // Fallback empty array chống crash

        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('Không tìm thấy dự án', 404);

        if (String(project.organizerId) !== String(organizerId)) {
            throw new AppError('Bạn không có quyền thao tác trên dự án này', 403);
        }

        if (project.status !== PROJECT_STATUS.EXECUTING) {
            throw new AppError('Chỉ có thể nộp bằng chứng khi dự án đang trong giai đoạn Thực thi (EXECUTING)', 400);
        }

        const milestones = project.milestones;
        const currentIdx = milestones.findIndex(m => m.milestoneId === milestoneId);
        const milestone = milestones[currentIdx];

        if (!milestone) throw new AppError('Mốc thời gian không tồn tại', 404);

        if (milestone.status === MILESTONE_STATUS.COMPLETED) {
            throw new AppError('Mốc này đã được nghiệm thu hoàn tất', 400);
        }

        if (currentIdx > 0) {
            const prevMilestone = milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) {
                throw new AppError('Nguyên tắc cuốn chiếu: Mốc liền trước đó phải được hoàn thành trước.', 400);
            }
        }

        let hasGeoPhotos = 0;
        if (mediaIds && mediaIds.length > 0) {
            hasGeoPhotos = await this.mediaRepository.countGeoVerifiedMedias(
                mediaIds, organizerId, milestone.location?.coordinates?.[0], milestone.location?.coordinates?.[1], 500
            );
        }

        const requireGeoPhotos = project.evidencePolicy?.requireGeoPhotos || milestone.evidencePolicy?.requireGeoPhotos || 0;
        if (requireGeoPhotos > 0 && hasGeoPhotos < 1) {
            throw new AppError('Bằng chứng bị từ chối: Bắt buộc phải có ít nhất 1 ảnh chứa tọa độ GPS tại hiện trường.', 400);
        }

        const financialReport = {
            spentAmount: milestone.targetAmount || 0,
            unspentAmount: 0,
            expenseItems: receiptMediaIds.map(receiptId => ({
                itemName: "Chứng từ/Hóa đơn tổng hợp theo Mốc",
                amount: 0,
                receiptMediaId: receiptId
            })),
            note: "Dữ liệu được tự động đồng bộ theo cấu hình Budget của dự án."
        };

        const newEvidencePayload = {
            projectId,
            milestoneId,
            organizerId,
            reportContent: payload.reportContent,
            mediaIds: payload.mediaIds,
            financialReport: financialReport,
            status: 'PENDING'
        };

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const newEvidence = await this.milestoneEvidenceRepository.upsertEvidenceAtomic(
                projectId, milestoneId, newEvidencePayload, session
            );

            if (!newEvidence) {
                throw new AppError('Mốc này đang chờ duyệt hoặc đã được duyệt. Không thể nộp đúp.', 409);
            }

            await this.projectRepository.updateMilestoneStatus(projectId, milestoneId, MILESTONE_STATUS.PROCESSING, session);

            dispatchEvent(DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL, { evidenceId: newEvidence._id, projectId });

            return newEvidence;
        });
    }

    async patchEvidence(evidenceId, organizerId, payload) {
        const evidence = await this.milestoneEvidenceRepository.findById(evidenceId);
        if (!evidence) throw new AppError('Không tìm thấy bản ghi', 404);
        if (String(evidence.organizerId) !== String(organizerId)) throw new AppError('Không có quyền thao tác', 403);

        if (evidence.status !== 'REVISION_REQUESTED') {
            throw new AppError('Chỉ có thể nộp bổ sung khi Admin có yêu cầu sửa đổi (REVISION_REQUESTED)', 400);
        }

        const project = await this.projectRepository.findById(evidence.projectId);
        const currentIdx = project.milestones.findIndex(m => m.milestoneId === evidence.milestoneId);
        const milestone = project.milestones[currentIdx];

        const updatedMediaIds = payload.mediaIds !== undefined ? payload.mediaIds : evidence.mediaIds;
        const updatedReportContent = payload.reportContent !== undefined ? payload.reportContent : evidence.reportContent;

        const immutableFinancialReport = evidence.financialReport;

        const evaluation = await this._evaluateEvidencePayload(
            project,
            milestone,
            currentIdx,
            organizerId,
            immutableFinancialReport,
            updatedMediaIds
        );

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const updatedEvidence = await this.milestoneEvidenceRepository.updateStatus(
                evidenceId,
                {
                    reportContent: updatedReportContent,
                    mediaIds: updatedMediaIds,
                    financialReport: immutableFinancialReport,
                    status: evaluation.finalStatus,
                    reviewNotes: evaluation.reviewNotes || '[Đã bổ sung] Đang chờ duyệt lại',
                    reviewedBy: evaluation.finalStatus === 'APPROVED' ? null : evidence.reviewedBy,
                    reviewedAt: evaluation.finalStatus === 'APPROVED' ? new Date() : evidence.reviewedAt
                },
                session
            );

            await this.projectRepository.updateMilestoneStatus(
                evidence.projectId,
                evidence.milestoneId,
                evaluation.finalMilestoneStatus,
                session
            );

            if (evaluation.finalStatus === 'APPROVED') {
                dispatchEvent(DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED, {
                    projectId: evidence.projectId,
                    milestoneId: evidence.milestoneId
                });
            } else {
                dispatchEvent(DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL, {
                    evidenceId,
                    projectId: evidence.projectId
                });
            }

            return updatedEvidence;
        });
    }

    async reviewEvidence(evidenceId, reviewerId, payload) {
        const { status, reviewNotes } = payload;

        const evidence = await this.milestoneEvidenceRepository.findById(evidenceId);
        if (!evidence) throw new AppError('Không tìm thấy bản ghi bằng chứng', 404);
        if (evidence.status !== 'PENDING') throw new AppError('Bằng chứng này đã được xử lý', 400);

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const updatedEvidence = await this.milestoneEvidenceRepository.updateStatus(
                evidenceId,
                { status, reviewNotes, reviewedBy: reviewerId, reviewedAt: new Date() },
                session
            );

            let nextMilestoneStatus = MILESTONE_STATUS.PROCESSING;

            if (status === 'APPROVED') {
                nextMilestoneStatus = MILESTONE_STATUS.COMPLETED;
            } else if (status === 'REJECTED') {
                nextMilestoneStatus = MILESTONE_STATUS.FAILED;
            } else if (status === 'REVISION_REQUESTED') {
                nextMilestoneStatus = MILESTONE_STATUS.PENDING;
            }

            await this.projectRepository.updateMilestoneStatus(
                evidence.projectId,
                evidence.milestoneId,
                nextMilestoneStatus,
                session
            );

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(evidence.organizerId)],
                title: `Kết quả nghiệm thu Mốc dự án`,
                message: `Báo cáo nghiệm thu của bạn đã được chuyển sang trạng thái: ${status}. ${reviewNotes ? `Ghi chú: ${reviewNotes}` : ''}`
            });

            return updatedEvidence;
        });
    }

    async getOrganizerEvidenceList(organizerId, query) {
        const { page, limit, projectId, status } = query;
        const skip = (page - 1) * limit;

        const result = await this.milestoneEvidenceRepository.findAndCountByOrganizer(
            organizerId,
            { projectId, status, skip, limit }
        );

        return {
            evidences: result.evidences,
            pagination: {
                total: result.total,
                page,
                limit,
                totalPages: Math.ceil(result.total / limit)
            }
        };
    }

    async getEvidenceDetail(evidenceId, userId, userRole) {
        const evidence = await this.milestoneEvidenceRepository.findById(evidenceId);
        if (!evidence) throw new AppError('Không tìm thấy bằng chứng nghiệm thu', 404);

        const isOwner = String(evidence.organizerId) === String(userId);
        const isPrivileged = ['admin', 'manager'].includes(userRole);

        if (!isOwner && !isPrivileged) {
            if (evidence.status !== 'APPROVED') {
                throw new AppError('Bạn không có quyền xem báo cáo này khi chưa được phê duyệt', 403);
            }
            return this.getPublicEvidence(evidence.projectId, evidence.milestoneId);
        }

        return evidence;
    }

    async getPublicEvidence(projectId, milestoneId) {
        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('Dự án không tồn tại', 404);

        const milestone = project.milestones.find(m => m.milestoneId === milestoneId);
        if (!milestone) throw new AppError('Mốc thời gian không tồn tại', 404);

        const evidence = await this.milestoneEvidenceRepository.findPublicApprovedByMilestone(projectId, milestoneId);

        if (!evidence) {
            if (milestone.status === MILESTONE_STATUS.COMPLETED) {
                return { message: "Bằng chứng đang được hệ thống tổng hợp lại.", status: milestone.status };
            }
            throw new AppError('Bằng chứng nghiệm thu hiện chưa sẵn dụng hoặc đang được kiểm duyệt.', 404);
        }

        const publicData = {
            reportContent: evidence.reportContent,
            financialReport: evidence.financialReport,
            evidenceImages: evidence.mediaIds,
            submittedAt: evidence.createdAt,
            status: evidence.status
        };

        if (project.projectType === PROJECT_TYPE.FUNDED) {
            const platformDisbursed = milestone.actualDisbursedAmount || 0;

            const currentIdx = project.milestones.findIndex(m => m.milestoneId === milestoneId);
            const rolloverFromPrevious = await this._getPreviousUnspentAmount(projectId, project.milestones, currentIdx);

            publicData.financialContext = {
                platformDisbursed,
                rolloverFromPrevious,
                totalAvailable: MoneyMath.add(platformDisbursed, rolloverFromPrevious)
            };
        }

        return publicData;
    }

    async getAdminEvidenceList(query) {
        const { page = 1, limit = 10, status, projectId } = query;
        const skip = (page - 1) * limit;

        const { data, total } = await this.milestoneEvidenceRepository.findAndCountForAdmin({
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

export default MilestoneEvidenceService;