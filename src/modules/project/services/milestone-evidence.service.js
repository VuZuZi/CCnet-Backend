import AppError from '../../../core/AppError.js';
import MoneyMath from '../../../core/MoneyMath.js';
import { MILESTONE_STATUS, PROJECT_STATUS, PROJECT_TYPE } from '../project.constant.js';
import { DOMAIN_EVENTS } from '../../../config/notification.js';

const SUBMISSION_MODES = Object.freeze({
    GPS_CHECKIN: 'GPS_CHECKIN',
    MANUAL_UPLOAD: 'MANUAL_UPLOAD'
});

const GPS_AUTO_PASS_RADIUS_METERS = 1000;

class MilestoneEvidenceService {
    constructor({
        milestoneEvidenceRepository,
        projectRepository,
        disbursementRequestRepository,
        mediaRepository,
        transactionManager,
        escrowRepository, // [NEW]: Inject th?m Repo n?y qua DI
        eventBus = null,
        volunteerEngagementService = null
    }) {
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.projectRepository = projectRepository;
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.mediaRepository = mediaRepository;
        this.transactionManager = transactionManager;
        this.escrowRepository = escrowRepository;
        this.eventBus = eventBus;
        this.volunteerEngagementService = volunteerEngagementService;
    }

    async _calculateFinancialContext(projectId) {
        const escrow = await this.escrowRepository.findByProjectId(projectId);
        const totalAvailable = escrow?.organizerRetainedBalance || 0;
        return { totalAvailable };
    }

    _normalizeSubmissionMode(mode) {
        return mode === SUBMISSION_MODES.GPS_CHECKIN
            ? SUBMISSION_MODES.GPS_CHECKIN
            : SUBMISSION_MODES.MANUAL_UPLOAD;
    }

    _normalizeId(value) {
        if (!value) return null;
        return String(value?._id || value?.id || value);
    }

    _getMilestoneTargetLocation(project, milestone) {
        if (milestone?.location?.coordinates?.length === 2) {
            return milestone.location;
        }
        if (project?.location?.coordinates?.length === 2) {
            return project.location;
        }
        return null;
    }

    _buildRealtimeMetadata({
        domainEvent,
        realtimeType,
        project,
        projectId,
        milestone,
        milestoneId,
        evidence,
        evidenceId,
        disbursementRequestId,
        organizerId,
        status,
        milestoneStatus,
        projectStatus,
        isAutoPass = false,
        requestedAmount,
        approvedAmount,
        updatedAt = new Date()
    }) {
        return {
            domainEvent,
            realtimeType,
            projectId: this._normalizeId(projectId || project?._id || evidence?.projectId),
            milestoneId: milestoneId || milestone?.milestoneId || evidence?.milestoneId || null,
            evidenceId: this._normalizeId(evidenceId || evidence?._id),
            disbursementRequestId: this._normalizeId(disbursementRequestId),
            organizerId: this._normalizeId(organizerId || project?.organizerId || evidence?.organizerId),
            status: status || null,
            milestoneStatus: milestoneStatus || null,
            projectStatus: projectStatus || project?.status || null,
            isAutoPass: Boolean(isAutoPass),
            requestedAmount,
            approvedAmount,
            updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt
        };
    }

    async _emitSystemNotifications(events = []) {
        if (!this.eventBus || !Array.isArray(events) || events.length === 0) return;

        for (const event of events) {
            try {
                const results = await this.eventBus.emit(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, event);
                const rejected = (results || []).filter((result) => result.status === 'rejected');
                if (rejected.length > 0) {
                    console.error('[MilestoneEvidenceService] Notification emit failed', {
                        event: DOMAIN_EVENTS.SYSTEM_NOTIFICATION,
                        rejectedCount: rejected.length,
                        errors: rejected.map((result) => result.reason?.message || result.reason)
                    });
                }
            } catch (error) {
                console.error('[MilestoneEvidenceService] Notification emit failed', {
                    event: DOMAIN_EVENTS.SYSTEM_NOTIFICATION,
                    error: error?.message || error
                });
            }
        }
    }

    async _getPreviousMilestoneUnspent(projectId, milestones, currentIdx) {
        if (currentIdx <= 0) return 0;

        const prevMilestone = milestones[currentIdx - 1];
        if (!prevMilestone) return 0;

        const prevEvidence = await this.milestoneEvidenceRepository.findApprovedByMilestone(
            projectId,
            prevMilestone.milestoneId
        );

        return prevEvidence?.financialReport?.unspentAmount || 0;
    }

    async _ensureFinancialMilestoneUnlocked(project, milestone, currentIdx) {
        const milestones = project?.milestones || [];
        const unspentFromPrevious = await this._getPreviousMilestoneUnspent(
            project._id,
            milestones,
            currentIdx
        );
        const requiredDisbursement = Math.max(0, Number(milestone.targetAmount || 0) - Number(unspentFromPrevious || 0));
        const actualDisbursed = Number(milestone.actualDisbursedAmount || 0);

        if (requiredDisbursement > 0 && actualDisbursed < requiredDisbursement) {
            throw new AppError(
                `Moc nay chua du dieu kien nghiem thu. Can giai ngan thanh cong toi thieu ${requiredDisbursement}d truoc khi nop bang chung.`,
                400
            );
        }
    }

    async _syncProjectCompletionStatus(projectId, session, notificationEvents = []) {
        const project = await this.projectRepository.findById(projectId, session);
        if (!project) return;
        if (project.status !== PROJECT_STATUS.EXECUTING) return;

        const milestones = Array.isArray(project.milestones) ? project.milestones : [];
        if (!milestones.length) return;

        const isAllMilestonesCompleted = milestones.every(
            (m) => String(m.status) === String(MILESTONE_STATUS.COMPLETED)
        );

        if (!isAllMilestonesCompleted) return;

        await this.projectRepository.updateById(
            projectId,
            { status: PROJECT_STATUS.COMPLETED },
            session
        );

        const metadata = this._buildRealtimeMetadata({
            domainEvent: DOMAIN_EVENTS.PROJECT_COMPLETION_SYNCED,
            realtimeType: 'project_completion_synced',
            project,
            projectStatus: PROJECT_STATUS.COMPLETED
        });

        notificationEvents.push({
            recipientIds: ['ADMIN_GROUP'],
            title: 'Du an da hoan thanh',
            message: `Tat ca milestone cua du an "${project.title}" da duoc nghiem thu. He thong da chuyen trang thai du an sang COMPLETED.`,
            actionUrl: `/admin/finance/${projectId}`,
            entityType: 'project',
            entityId: String(projectId),
            metadata
        });

        notificationEvents.push({
            recipientIds: [String(project.organizerId)],
            title: 'Du an da hoan thanh',
            message: `Tat ca milestone cua du an "${project.title}" da duoc nghiem thu. He thong da chuyen trang thai du an sang COMPLETED.`,
            actionUrl: `/projects/${projectId}?tab=milestones`,
            entityType: 'project',
            entityId: String(projectId),
            metadata
        });
    }

    async _initializeVolunteerReviewsIfCompleted(projectId) {
        if (!this.volunteerEngagementService || !projectId) return;

        try {
            await this.volunteerEngagementService.onProjectCompleted(projectId);
        } catch (error) {
            console.error('[MilestoneEvidenceService] Failed to initialize volunteer reviews for completed project', {
                projectId: String(projectId),
                error: error?.message || error
            });
        }
    }

    _extractReceiptMediaIds(expenseItems = []) {
        if (!Array.isArray(expenseItems)) return [];
        return expenseItems
            .map(item => item?.receiptMediaId)
            .filter(Boolean);
    }

    async _assertMediaOwnership(mediaIds = [], organizerId, contextMessage = 'mediaIds') {
        if (!Array.isArray(mediaIds) || mediaIds.length === 0) return [];

        const uniqueIds = [...new Set(mediaIds.map(String))];
        const ownedMedias = await this.mediaRepository.findManyByIdsAndOwner(uniqueIds, organizerId);

        if (ownedMedias.length !== uniqueIds.length) {
            throw new AppError(`Có file trong ${contextMessage} không thuộc quyền sở hữu của Organizer`, 403);
        }

        return ownedMedias;
    }

    _buildFinancialReportPayload(totalAvailable, spentAmount, expenseItemsPayload = [], note = "") {
        const unspentAmount = spentAmount <= totalAvailable
            ? MoneyMath.subtract(totalAvailable, spentAmount)
            : 0;

        const overspentAmount = spentAmount > totalAvailable
            ? MoneyMath.subtract(spentAmount, totalAvailable)
            : 0;

        const formattedItems = Array.isArray(expenseItemsPayload) ? expenseItemsPayload.map(item => ({
            itemName: item.itemName || "Hóa đơn/Chứng từ tổng hợp",
            amount: Number(item.amount) || 0,
            note: item.note || "",
            receiptMediaId: item.receiptMediaId || null
        })) : [];

        return {
            spentAmount,
            approvedSpentAmount: null,
            unspentAmount,
            overspentAmount,
            expenseItems: formattedItems,
            note: note || "Khai báo chi tiêu từ Organizer. Đang chờ Kế toán duyệt."
        };
    }

    async _evaluateEvidencePayload(project, milestone, currentIdx, organizerId, financialReport, mediaIds, submissionMode) {
        const normalizedSubmissionMode = this._normalizeSubmissionMode(submissionMode);
        const isFinancialMilestone = Number(milestone.targetAmount || 0) > 0;

        let finalStatus = 'PENDING';
        let finalMilestoneStatus = MILESTONE_STATUS.PROCESSING;
        let reviewNotes = null;
        let geoVerifiedCount = 0;
        let gpsFailureReason = null;

        if (isFinancialMilestone) {
            reviewNotes = 'Đã nộp báo cáo chi tiêu. Hệ thống ghi nhận và duyệt.';
        } else if (normalizedSubmissionMode === SUBMISSION_MODES.GPS_CHECKIN) {
            const targetLocation = this._getMilestoneTargetLocation(project, milestone);
            if (mediaIds && mediaIds.length > 0 && targetLocation?.coordinates?.length === 2) {
                const [mLong, mLat] = targetLocation.coordinates;
                geoVerifiedCount = await this.mediaRepository.countGeoVerifiedMedias(
                    mediaIds,
                    organizerId,
                    mLong,
                    mLat,
                    GPS_AUTO_PASS_RADIUS_METERS
                );
            } else {
                gpsFailureReason = 'MISSING_LOCATION';
            }

            if (geoVerifiedCount >= 1) {
                finalStatus = 'APPROVED';
                finalMilestoneStatus = MILESTONE_STATUS.COMPLETED;
                reviewNotes = `[HỆ THỐNG AUTO-PASS] Xác thực thành công (${geoVerifiedCount} ảnh hợp lệ) tại hiện trường.`;
            } else {
                gpsFailureReason = gpsFailureReason || 'OUT_OF_RANGE';
                reviewNotes = `[HỆ THỐNG GHI NHẬN] Organizer nộp ảnh thường, không đạt chuẩn GPS tại hiện trường. Chuyển trạng thái chờ duyệt thủ công.`;
            }
        } else {
            reviewNotes = '[HE THONG GHI NHAN] Organizer nop bang chung thu cong. Chuyen trang thai cho duyet.';
        }

        return {
            finalStatus,
            finalMilestoneStatus,
            reviewNotes,
            isFinancialMilestone,
            isAutoPass: finalStatus === 'APPROVED' && !isFinancialMilestone,
            submissionMode: normalizedSubmissionMode,
            geoVerifiedCount,
            gpsFailureReason
        };
    }

    async submitEvidence(payload) {
        const { projectId, milestoneId, organizerId, mediaIds, spentAmount, expenseItems, receiptMediaIds } = payload;
        const submissionMode = this._normalizeSubmissionMode(payload.submissionMode);

        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('Không tìm thấy dự án', 404);

        if (String(project.organizerId) !== String(organizerId)) {
            throw new AppError('Bạn không có quyền thao tác trên dự án này', 403);
        }

        if (project.status !== PROJECT_STATUS.EXECUTING) {
            throw new AppError('Chỉ có thể nộp bằng chứng khi dự án đang trong giai đoạn thực thi', 400);
        }

        const milestones = project.milestones || [];
        const currentIdx = milestones.findIndex(m => m.milestoneId === milestoneId);
        const milestone = milestones[currentIdx];

        if (!milestone) throw new AppError('Mốc thời gian không tồn tại', 404);
        if (milestone.status === MILESTONE_STATUS.COMPLETED) throw new AppError('Mốc này đã được nghiệm thu hoàn tất', 400);

        if (currentIdx > 0) {
            const prevMilestone = milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) {
                throw new AppError('Mốc liền trước phải được hoàn thành trước.', 400);
            }
        }

        await this._assertMediaOwnership(mediaIds || [], organizerId, 'mediaIds');

        let financialReport = null;
        const isFinancialMilestone = milestone.targetAmount > 0;

        if (!isFinancialMilestone && (!Array.isArray(mediaIds) || mediaIds.length === 0)) {
            throw new AppError('Moc 0d bat buoc phai co it nhat 1 anh check-in hoac anh hien truong', 400);
        }

        if (project.projectType === PROJECT_TYPE.FUNDED) {
            if (isFinancialMilestone) {
                await this._ensureFinancialMilestoneUnlocked(project, milestone, currentIdx);
            }

            const { totalAvailable } = await this._calculateFinancialContext(project._id);

            if (isFinancialMilestone) {
                if (spentAmount === undefined || spentAmount === null) {
                    throw new AppError('Bat buoc phai khai bao tong so tien da chi (spentAmount) doi voi moc co ngan sach.', 400);
                }

                const expenseItemsInput = (expenseItems && expenseItems.length > 0)
                    ? expenseItems
                    : (receiptMediaIds || []).map(id => ({ receiptMediaId: id }));
                const receiptIds = this._extractReceiptMediaIds(expenseItemsInput);
                await this._assertMediaOwnership(receiptIds, organizerId, 'expenseItems.receiptMediaId');
                if (receiptIds.length === 0) {
                    throw new AppError('Moc co ngan sach bat buoc phai tai len it nhat 1 hoa don/chung tu', 400);
                }
                financialReport = this._buildFinancialReportPayload(totalAvailable, spentAmount, expenseItemsInput);
            }
        }

        const evaluation = await this._evaluateEvidencePayload(
            project, milestone, currentIdx, organizerId, financialReport, mediaIds, submissionMode
        );

        const newEvidencePayload = {
            projectId,
            milestoneId,
            organizerId,
            reportContent: payload.reportContent,
            mediaIds: mediaIds || [],
            financialReport,
            status: evaluation.finalStatus,
            reviewNotes: evaluation.reviewNotes,
            reviewedAt: evaluation.finalStatus === 'APPROVED' ? new Date() : null,
        };

        const notificationEvents = [];

        const createdEvidence = await this.transactionManager.runInTransaction(async (session) => {
            const newEvidence = await this.milestoneEvidenceRepository.upsertEvidenceAtomic(
                projectId, milestoneId, newEvidencePayload, session
            );

            if (!newEvidence) throw new AppError('Mốc này đang chờ duyệt hoặc đã được duyệt. Không thể nộp đúp.', 409);

            await this.projectRepository.updateMilestoneStatus(projectId, milestoneId, evaluation.finalMilestoneStatus, session);

            const evidenceMetadata = this._buildRealtimeMetadata({
                domainEvent: evaluation.isAutoPass
                    ? DOMAIN_EVENTS.EVIDENCE_AUTO_APPROVED_GPS
                    : DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL,
                realtimeType: evaluation.isAutoPass
                    ? 'evidence_auto_approved_gps'
                    : 'evidence_submitted_manual',
                project,
                milestone,
                evidence: newEvidence,
                organizerId,
                status: evaluation.finalStatus,
                milestoneStatus: evaluation.finalMilestoneStatus,
                isAutoPass: evaluation.isAutoPass,
                updatedAt: newEvidence.updatedAt || newEvidence.createdAt || new Date()
            });

            if (evaluation.finalStatus === 'APPROVED') {
                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Moc da duoc nghiem thu tu dong',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da duoc auto-pass bang GPS.`,
                    actionUrl: `/admin/finance/${projectId}`,
                    entityType: 'milestone_evidence',
                    entityId: String(newEvidence._id),
                    metadata: evidenceMetadata
                });

                notificationEvents.push({
                    recipientIds: [String(organizerId)],
                    title: 'Moc da duoc nghiem thu tu dong',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da duoc auto-pass bang GPS.`,
                    actionUrl: `/projects/${projectId}?tab=milestones`,
                    entityType: 'milestone_evidence',
                    entityId: String(newEvidence._id),
                    metadata: evidenceMetadata
                });

                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Moc du an da hoan thanh',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da chuyen sang COMPLETED.`,
                    actionUrl: `/admin/finance/${projectId}`,
                    entityType: 'project_milestone',
                    entityId: String(projectId),
                    metadata: {
                        ...evidenceMetadata,
                        domainEvent: DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED,
                        realtimeType: 'milestone_completed'
                    }
                });

                notificationEvents.push({
                    recipientIds: [String(organizerId)],
                    title: 'Moc du an da hoan thanh',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da chuyen sang COMPLETED.`,
                    actionUrl: `/projects/${projectId}?tab=milestones`,
                    entityType: 'project_milestone',
                    entityId: String(projectId),
                    metadata: {
                        ...evidenceMetadata,
                        domainEvent: DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED,
                        realtimeType: 'milestone_completed'
                    }
                });

                await this._syncProjectCompletionStatus(projectId, session, notificationEvents);
            } else {
                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Bang chung moi cho duyet thu cong',
                    message: `Organizer da nop bang chung cho moc "${milestone.title}" cua du an "${project.title}".`,
                    actionUrl: `/admin/finance/${projectId}`,
                    entityType: 'milestone_evidence',
                    entityId: String(newEvidence._id),
                    metadata: evidenceMetadata
                });
            }

            return newEvidence;
        });

        await this._emitSystemNotifications(notificationEvents);

        return {
            ...createdEvidence,
            submissionMode: evaluation.submissionMode,
            isAutoPass: evaluation.isAutoPass,
            gpsFailureReason: evaluation.gpsFailureReason
        };
    }

    async patchEvidence(evidenceId, organizerId, payload) {
        const submissionMode = this._normalizeSubmissionMode(payload.submissionMode);
        const evidence = await this.milestoneEvidenceRepository.findById(evidenceId);
        if (!evidence) throw new AppError('Không tìm thấy bản ghi', 404);
        if (String(evidence.organizerId) !== String(organizerId)) throw new AppError('Không có quyền thao tác', 403);
        if (evidence.status !== 'REVISION_REQUESTED') throw new AppError('Chỉ có thể nộp bổ sung khi có yêu cầu sửa đổi', 400);

        const project = await this.projectRepository.findById(evidence.projectId);
        if (!project) throw new AppError('Khong tim thay du an', 404);
        const currentIdx = project.milestones.findIndex(m => m.milestoneId === evidence.milestoneId);
        const milestone = project.milestones[currentIdx];
        if (!milestone) throw new AppError('Moc thoi gian khong ton tai', 404);

        const updatedMediaIds = payload.mediaIds !== undefined ? payload.mediaIds : evidence.mediaIds;
        const updatedReportContent = payload.reportContent !== undefined ? payload.reportContent : evidence.reportContent;
        await this._assertMediaOwnership(updatedMediaIds || [], organizerId, 'mediaIds');

        let newFinancialReport = evidence.financialReport;
        const isFinancialMilestone = milestone.targetAmount > 0;

        if (project.projectType === PROJECT_TYPE.FUNDED && isFinancialMilestone) {
            const { totalAvailable } = await this._calculateFinancialContext(project._id);
            const updatedSpentAmount = payload.spentAmount !== undefined ? payload.spentAmount : evidence.financialReport?.spentAmount;

            if (updatedSpentAmount === undefined || updatedSpentAmount === null || updatedSpentAmount < 0) {
                throw new AppError('Bắt buộc phải khai báo tổng số tiền đã chi hợp lệ.', 400);
            }

            const expenseItemsInput = (payload.expenseItems && payload.expenseItems.length > 0)
                ? payload.expenseItems
                : (payload.receiptMediaIds && payload.receiptMediaIds.length > 0)
                    ? payload.receiptMediaIds.map(id => ({ receiptMediaId: id }))
                    : (evidence.financialReport?.expenseItems || []);
            const receiptIds = this._extractReceiptMediaIds(expenseItemsInput);
            await this._assertMediaOwnership(receiptIds, organizerId, 'expenseItems.receiptMediaId');
            if (receiptIds.length === 0) {
                throw new AppError('Moc co ngan sach bat buoc phai tai len it nhat 1 hoa don/chung tu', 400);
            }
            newFinancialReport = this._buildFinancialReportPayload(totalAvailable, updatedSpentAmount, expenseItemsInput, evidence.financialReport?.note);
        }

        const evaluation = await this._evaluateEvidencePayload(project, milestone, currentIdx, organizerId, newFinancialReport, updatedMediaIds, submissionMode);

        const notificationEvents = [];

        const updatedEvidenceResult = await this.transactionManager.runInTransaction(async (session) => {
            let finalReviewNotes = evaluation.reviewNotes;
            if (evaluation.finalStatus === 'PENDING') {
                finalReviewNotes = `[ĐÃ NỘP BỔ SUNG] ${finalReviewNotes || 'Organizer đã cập nhật báo cáo. Đang chờ duyệt lại.'}`;
            }

            const updatedEvidence = await this.milestoneEvidenceRepository.updateStatus(
                evidenceId,
                {
                    reportContent: updatedReportContent,
                    mediaIds: updatedMediaIds,
                    financialReport: newFinancialReport,
                    status: evaluation.finalStatus,
                    reviewNotes: finalReviewNotes,
                    reviewedBy: evaluation.finalStatus === 'APPROVED' ? null : evidence.reviewedBy,
                    reviewedAt: evaluation.finalStatus === 'APPROVED' ? new Date() : evidence.reviewedAt
                },
                session
            );

            await this.projectRepository.updateMilestoneStatus(evidence.projectId, evidence.milestoneId, evaluation.finalMilestoneStatus, session);

            const evidenceMetadata = this._buildRealtimeMetadata({
                domainEvent: evaluation.isAutoPass
                    ? DOMAIN_EVENTS.EVIDENCE_AUTO_APPROVED_GPS
                    : DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL,
                realtimeType: evaluation.isAutoPass
                    ? 'evidence_auto_approved_gps'
                    : 'evidence_submitted_manual',
                project,
                milestone,
                evidence: updatedEvidence,
                organizerId,
                status: evaluation.finalStatus,
                milestoneStatus: evaluation.finalMilestoneStatus,
                isAutoPass: evaluation.isAutoPass,
                updatedAt: updatedEvidence.updatedAt || new Date()
            });

            if (evaluation.finalStatus === 'APPROVED') {
                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Moc da duoc nghiem thu tu dong',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da duoc auto-pass bang GPS.`,
                    actionUrl: `/admin/finance/${evidence.projectId}`,
                    entityType: 'milestone_evidence',
                    entityId: String(updatedEvidence._id),
                    metadata: evidenceMetadata
                });

                notificationEvents.push({
                    recipientIds: [String(organizerId)],
                    title: 'Moc da duoc nghiem thu tu dong',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da duoc auto-pass bang GPS.`,
                    actionUrl: `/projects/${evidence.projectId}?tab=milestones`,
                    entityType: 'milestone_evidence',
                    entityId: String(updatedEvidence._id),
                    metadata: evidenceMetadata
                });

                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Moc du an da hoan thanh',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da chuyen sang COMPLETED.`,
                    actionUrl: `/admin/finance/${evidence.projectId}`,
                    entityType: 'project_milestone',
                    entityId: String(evidence.projectId),
                    metadata: {
                        ...evidenceMetadata,
                        domainEvent: DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED,
                        realtimeType: 'milestone_completed'
                    }
                });

                notificationEvents.push({
                    recipientIds: [String(organizerId)],
                    title: 'Moc du an da hoan thanh',
                    message: `Moc "${milestone.title}" cua du an "${project.title}" da chuyen sang COMPLETED.`,
                    actionUrl: `/projects/${evidence.projectId}?tab=milestones`,
                    entityType: 'project_milestone',
                    entityId: String(evidence.projectId),
                    metadata: {
                        ...evidenceMetadata,
                        domainEvent: DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED,
                        realtimeType: 'milestone_completed'
                    }
                });

                await this._syncProjectCompletionStatus(evidence.projectId, session, notificationEvents);
            } else {
                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Bang chung moi cho duyet thu cong',
                    message: `Organizer da nop lai bang chung cho moc "${milestone.title}" cua du an "${project.title}".`,
                    actionUrl: `/admin/finance/${evidence.projectId}`,
                    entityType: 'milestone_evidence',
                    entityId: String(evidenceId),
                    metadata: evidenceMetadata
                });
            }

            return updatedEvidence;
        });

        await this._emitSystemNotifications(notificationEvents);

        return {
            ...updatedEvidenceResult,
            submissionMode: evaluation.submissionMode,
            isAutoPass: evaluation.isAutoPass,
            gpsFailureReason: evaluation.gpsFailureReason
        };
    }

    async reviewEvidence(evidenceId, reviewerId, payload) {
        const { status, reviewNotes, approvedSpentAmount } = payload;

        if (status !== 'APPROVED' && approvedSpentAmount !== undefined) {
            throw new AppError('Chi duoc gui approvedSpentAmount khi duyet APPROVED', 400);
        }

        const notificationEvents = [];

        const reviewedEvidence = await this.transactionManager.runInTransaction(async (session) => {
            const evidence = await this.milestoneEvidenceRepository.findById(evidenceId, session);
            if (!evidence) throw new AppError('Khong tim thay ban ghi bang chung', 404);
            if (evidence.status !== 'PENDING') throw new AppError('Bang chung nay da duoc xu ly', 400);

            const project = await this.projectRepository.findById(evidence.projectId, session);
            if (!project) throw new AppError('Du an khong ton tai', 404);

            let updatedFinancialReport = evidence.financialReport;
            let decrementAmount = 0;

            if (status === 'APPROVED' && project.projectType === PROJECT_TYPE.FUNDED && updatedFinancialReport) {
                const escrow = await this.escrowRepository.findByProjectId(project._id, session);
                const currentRetained = escrow?.organizerRetainedBalance || 0;

                const finalSpentAmount = approvedSpentAmount !== undefined ? approvedSpentAmount : updatedFinancialReport.spentAmount;

                const unspentAmount = finalSpentAmount <= currentRetained ? MoneyMath.subtract(currentRetained, finalSpentAmount) : 0;
                const overspentAmount = finalSpentAmount > currentRetained ? MoneyMath.subtract(finalSpentAmount, currentRetained) : 0;

                updatedFinancialReport = {
                    ...updatedFinancialReport,
                    approvedSpentAmount: finalSpentAmount,
                    unspentAmount,
                    overspentAmount
                };

                decrementAmount = Math.min(currentRetained, finalSpentAmount);
            }

            const updatedEvidence = await this.milestoneEvidenceRepository.updateStatusIfCurrent(
                evidenceId,
                'PENDING',
                {
                    status,
                    reviewNotes,
                    reviewedBy: reviewerId,
                    reviewedAt: new Date(),
                    financialReport: updatedFinancialReport
                },
                session
            );

            if (!updatedEvidence) {
                throw new AppError('Bang chung da duoc xu ly boi nguoi khac', 409);
            }

            if (decrementAmount > 0) {
                await this.escrowRepository.updateOrganizerRetainedBalance(project._id, -decrementAmount, session);
            }

            let nextMilestoneStatus = MILESTONE_STATUS.PROCESSING;
            if (status === 'APPROVED') nextMilestoneStatus = MILESTONE_STATUS.COMPLETED;
            else if (status === 'REJECTED') nextMilestoneStatus = MILESTONE_STATUS.FAILED;
            else if (status === 'REVISION_REQUESTED') nextMilestoneStatus = MILESTONE_STATUS.PENDING;

            await this.projectRepository.updateMilestoneStatus(evidence.projectId, evidence.milestoneId, nextMilestoneStatus, session);

            const milestone = (project.milestones || []).find(
                (item) => item.milestoneId === evidence.milestoneId
            );
            const reviewMetadata = this._buildRealtimeMetadata({
                domainEvent: DOMAIN_EVENTS.EVIDENCE_REVIEWED,
                realtimeType: 'evidence_reviewed',
                project,
                milestone,
                evidence: updatedEvidence,
                organizerId: evidence.organizerId,
                status,
                milestoneStatus: nextMilestoneStatus,
                isAutoPass: false,
                updatedAt: updatedEvidence.updatedAt || new Date()
            });

            notificationEvents.push({
                recipientIds: ['ADMIN_GROUP'],
                title: `Ket qua nghiem thu Moc du an`,
                message: `Bao cao nghiem thu da duoc chuyen sang trang thai: ${status}. ${reviewNotes ? `Ghi chu: ${reviewNotes}` : ''}`,
                actionUrl: `/admin/finance/${evidence.projectId}`,
                entityType: 'milestone_evidence',
                entityId: String(evidenceId),
                metadata: reviewMetadata
            });

            notificationEvents.push({
                recipientIds: [String(evidence.organizerId)],
                title: `Ket qua nghiem thu Moc du an`,
                message: `Bao cao nghiem thu da duoc chuyen sang trang thai: ${status}. ${reviewNotes ? `Ghi chu: ${reviewNotes}` : ''}`,
                actionUrl: `/projects/${evidence.projectId}?tab=milestones`,
                entityType: 'milestone_evidence',
                entityId: String(evidenceId),
                metadata: reviewMetadata
            });

            if (status === 'APPROVED') {
                notificationEvents.push({
                    recipientIds: ['ADMIN_GROUP'],
                    title: 'Moc du an da hoan thanh',
                    message: `Moc "${milestone?.title || evidence.milestoneId}" cua du an "${project.title}" da chuyen sang COMPLETED.`,
                    actionUrl: `/admin/finance/${evidence.projectId}`,
                    entityType: 'project_milestone',
                    entityId: String(evidence.projectId),
                    metadata: {
                        ...reviewMetadata,
                        domainEvent: DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED,
                        realtimeType: 'milestone_completed',
                        milestoneStatus: MILESTONE_STATUS.COMPLETED
                    }
                });

                notificationEvents.push({
                    recipientIds: [String(evidence.organizerId)],
                    title: 'Moc du an da hoan thanh',
                    message: `Moc "${milestone?.title || evidence.milestoneId}" cua du an "${project.title}" da chuyen sang COMPLETED.`,
                    actionUrl: `/projects/${evidence.projectId}?tab=milestones`,
                    entityType: 'project_milestone',
                    entityId: String(evidence.projectId),
                    metadata: {
                        ...reviewMetadata,
                        domainEvent: DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED,
                        realtimeType: 'milestone_completed',
                        milestoneStatus: MILESTONE_STATUS.COMPLETED
                    }
                });

                await this._syncProjectCompletionStatus(evidence.projectId, session, notificationEvents);
            }

            return updatedEvidence;
        });

        await this._emitSystemNotifications(notificationEvents);
        await this._initializeVolunteerReviewsIfCompleted(reviewedEvidence?.projectId);

        return reviewedEvidence;
    }

    async getOrganizerEvidenceList(organizerId, query) {
        const { page, limit, projectId, status } = query;
        const skip = (page - 1) * limit;

        const result = await this.milestoneEvidenceRepository.findAndCountByOrganizer(
            organizerId, { projectId, status, skip, limit }
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
        const evidence = await this.milestoneEvidenceRepository.findDetailWithPopulate(evidenceId);

        if (!evidence) {
            throw new AppError('Không tìm thấy bằng chứng nghiệm thu', 404);
        }

        const organizerId = evidence.organizerId._id || evidence.organizerId;
        const isOwner = String(organizerId) === String(userId);
        const isPrivileged = ['admin', 'manager'].includes(userRole);

        if (!isOwner && !isPrivileged) {
            if (evidence.status !== 'APPROVED') {
                throw new AppError('Bạn không có quyền xem báo cáo này khi chưa được phê duyệt', 403);
            }
            return this.getPublicEvidence(evidence.projectId._id || evidence.projectId, evidence.milestoneId);
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
            throw new AppError('Bằng chứng nghiệm thu hiện chưa sẵn dùng hoặc đang được kiểm duyệt.', 404);
        }

        const publicData = {
            reportContent: evidence.reportContent,
            financialReport: evidence.financialReport,
            evidenceImages: evidence.mediaIds,
            submittedAt: evidence.createdAt,
            status: evidence.status
        };

        if (project.projectType === PROJECT_TYPE.FUNDED) {
            const { totalAvailable } = await this._calculateFinancialContext(projectId);
            const actualDisbursed = milestone.actualDisbursedAmount || 0;

            publicData.financialContext = {
                platformDisbursed: actualDisbursed,
                rolloverFromPrevious: Math.max(0, totalAvailable - actualDisbursed),
                totalAvailable: totalAvailable,
                approvedSpentAmount: evidence.financialReport?.approvedSpentAmount || evidence.financialReport?.spentAmount,
                overspentAmount: evidence.financialReport?.overspentAmount || 0
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




