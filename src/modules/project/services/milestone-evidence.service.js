import AppError from '../../../core/AppError.js';
import { MILESTONE_STATUS, PROJECT_STATUS, PROJECT_TYPE } from '../project.constant.js';
import { DOMAIN_EVENTS } from '../../../config/notification.js';

class MilestoneEvidenceService {
    constructor({
        milestoneEvidenceRepository,
        projectRepository,
        disbursementRequestRepository,
        mediaRepository,
        transactionManager,
        eventBus
    }) {
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.projectRepository = projectRepository;
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.mediaRepository = mediaRepository;
        this.transactionManager = transactionManager;
        this.eventBus = eventBus;
    }

    _calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
        const R = 6371e3;
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async submitEvidence(payload) {
        const { projectId, milestoneId, organizerId, reportContent, financialReport, mediaIds } = payload;

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

        if (project.projectType === PROJECT_TYPE.FUNDED) {
            const totalDisbursed = await this.disbursementRequestRepository.getTotalDisbursedForMilestone(projectId, milestoneId);
            let previousUnspent = 0;
            if (currentIdx > 0) {
                const prevMilestone = milestones[currentIdx - 1];
                const prevEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(projectId, prevMilestone.milestoneId);
                if (prevEvidence && prevEvidence.financialReport) {
                    previousUnspent = prevEvidence.financialReport.unspentAmount || 0;
                }
            }
            const totalAvailable = totalDisbursed + previousUnspent;

            if (totalAvailable > 0) {
                if (!financialReport) throw new AppError('Bắt buộc phải có báo cáo tài chính để giải trình.', 400);
                const { spentAmount = 0, unspentAmount = 0 } = financialReport;
                if ((spentAmount + unspentAmount) !== totalAvailable) {
                    throw new AppError(`Sai lệch kế toán. Tổng giải trình phải khớp với ${totalAvailable} VNĐ.`, 400);
                }
            }
        }

        let geoVerifiedCount = 0;
        if (mediaIds && mediaIds.length > 0) {
            const validMedias = await this.mediaRepository.findManyByIdsAndOwner(mediaIds, organizerId);
            if (validMedias.length !== mediaIds.length) {
                throw new AppError('Một số bằng chứng không hợp lệ hoặc không thuộc quyền sở hữu của bạn', 403);
            }

            const targetLocation = milestone.location?.coordinates?.length === 2
                ? milestone.location
                : project.location;

            if (targetLocation && targetLocation.coordinates) {
                const [mLong, mLat] = targetLocation.coordinates;
                for (const media of validMedias) {
                    if (media.captureMetadata && media.captureMetadata.lat && media.captureMetadata.lng) {
                        const distance = this._calculateDistanceInMeters(
                            media.captureMetadata.lat, media.captureMetadata.lng,
                            mLat, mLong
                        );
                        if (distance <= 500) {
                            geoVerifiedCount++;
                        }
                    }
                }
            }
        }

        const policy = milestone.evidencePolicy || {
            requireFinancial: milestone.targetAmount > 0,
            requireGeoPhotos: milestone.targetAmount === 0 ? 1 : 0
        };

        let finalStatus = 'PENDING';
        let reviewNotes = null;
        let finalMilestoneStatus = MILESTONE_STATUS.PROCESSING;

        if (!policy.requireFinancial && policy.requireGeoPhotos > 0) {
            if (geoVerifiedCount >= policy.requireGeoPhotos) {
                finalStatus = 'APPROVED';
                finalMilestoneStatus = MILESTONE_STATUS.COMPLETED;
                reviewNotes = `[HỆ THỐNG AUTO-PASS] Xác thực thành công (${geoVerifiedCount}/${policy.requireGeoPhotos} ảnh hợp lệ) tại hiện trường (sai số <500m).`;
            } else {
                reviewNotes = `[HỆ THỐNG GHI NHẬN] Organizer nộp ảnh nhưng không chứa tọa độ GPS hợp lệ hoặc nằm ngoài bán kính 500m. Cần kiểm tra thủ công.`;
            }
        }

        const existingEvidence = await this.milestoneEvidenceRepository.findByMilestone(projectId, milestoneId);

        const result = await this.transactionManager.runInTransaction(async (session) => {
            let evidence;
            const savePayload = {
                projectId, milestoneId, organizerId, reportContent, mediaIds,
                financialReport: policy.requireFinancial ? financialReport : null,
                status: finalStatus,
                reviewNotes,
                reviewedBy: finalStatus === 'APPROVED' ? null : undefined,
                reviewedAt: finalStatus === 'APPROVED' ? new Date() : undefined
            };

            if (existingEvidence) {
                if (['PENDING', 'APPROVED'].includes(existingEvidence.status)) {
                    throw new AppError('Mốc này đang chờ duyệt hoặc đã được duyệt. Không thể nộp đúp.', 409);
                }
                evidence = await this.milestoneEvidenceRepository.updateStatus(existingEvidence._id, savePayload, session);
            } else {
                evidence = await this.milestoneEvidenceRepository.create(savePayload, session);
            }

            await this.projectRepository.updateMilestoneStatus(projectId, milestoneId, finalMilestoneStatus, session);

            return evidence;
        });

        if (this.eventBus) {
            if (finalStatus === 'APPROVED') {
                this.eventBus.emit(DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED, { projectId, milestoneId });
            } else {
                this.eventBus.emit(DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL, { evidenceId: result._id, projectId });
            }
        }

        return result;
    }

    async reviewEvidence(evidenceId, reviewerId, payload) {
        const { status, reviewNotes } = payload;

        const evidence = await this.milestoneEvidenceRepository.findById(evidenceId);
        if (!evidence) throw new AppError('Không tìm thấy bản ghi bằng chứng', 404);
        if (evidence.status !== 'PENDING') throw new AppError('Bằng chứng này đã được xử lý', 400);

        return await this.transactionManager.runInTransaction(async (session) => {
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

            if (this.eventBus) {
                this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                    recipientIds: [String(evidence.organizerId)],
                    title: `Kết quả nghiệm thu Mốc dự án`,
                    message: `Báo cáo nghiệm thu của bạn đã được chuyển sang trạng thái: ${status}. ${reviewNotes ? `Ghi chú: ${reviewNotes}` : ''}`
                });
            }

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
            const platformDisbursed = await this.disbursementRequestRepository.getTotalDisbursedForMilestone(projectId, milestoneId);
            let rolloverFromPrevious = 0;

            const currentIdx = project.milestones.findIndex(m => m.milestoneId === milestoneId);
            if (currentIdx > 0) {
                const prevMilestone = project.milestones[currentIdx - 1];
                const prevEvidence = await this.milestoneEvidenceRepository.findPublicApprovedByMilestone(projectId, prevMilestone.milestoneId);
                if (prevEvidence && prevEvidence.financialReport) {
                    rolloverFromPrevious = prevEvidence.financialReport.unspentAmount || 0;
                }
            }

            publicData.financialContext = {
                platformDisbursed,
                rolloverFromPrevious,
                totalAvailable: platformDisbursed + rolloverFromPrevious
            };
        }

        return publicData;
    }
}

export default MilestoneEvidenceService;