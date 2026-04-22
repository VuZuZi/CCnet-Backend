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
        escrowRepository // [NEW]: Inject thÃªm Repo nÃ y qua DI
    }) {
        this.milestoneEvidenceRepository = milestoneEvidenceRepository;
        this.projectRepository = projectRepository;
        this.disbursementRequestRepository = disbursementRequestRepository;
        this.mediaRepository = mediaRepository;
        this.transactionManager = transactionManager;
        this.escrowRepository = escrowRepository;
    }

    // [FIXED]: Láº¥y trá»±c tiáº¿p Single Source of Truth tá»« Escrow Ledger
    async _calculateFinancialContext(projectId) {
        const escrow = await this.escrowRepository.findByProjectId(projectId);
        const totalAvailable = escrow?.organizerRetainedBalance || 0;
        return { totalAvailable };
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

    async _syncProjectCompletionStatus(projectId, session, dispatchEvent) {
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

        dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
            recipientIds: [String(project.organizerId), 'ADMIN_GROUP'],
            title: 'Du an da hoan thanh',
            message: `Tat ca milestone cua du an "${project.title}" da duoc nghiem thu. He thong da chuyen trang thai du an sang COMPLETED.`
        });
    }

    _extractReceiptMediaIds(expenseItems = []) {
        if (!Array.isArray(expenseItems)) return [];
        return expenseItems
            .map(item => item?.receiptMediaId)
            .filter(Boolean);
    }

    async _assertMediaOwnership(mediaIds = [], organizerId, contextMessage = 'mediaIds') {
        if (!Array.isArray(mediaIds) || mediaIds.length === 0) return;

        const uniqueIds = [...new Set(mediaIds.map(String))];
        const ownedMedias = await this.mediaRepository.findManyByIdsAndOwner(uniqueIds, organizerId);

        if (ownedMedias.length !== uniqueIds.length) {
            throw new AppError(`CÃ³ file trong ${contextMessage} khÃ´ng thuá»™c quyá»n sá»Ÿ há»¯u cá»§a Organizer`, 403);
        }
    }

    _buildFinancialReportPayload(totalAvailable, spentAmount, expenseItemsPayload = [], note = "") {
        const unspentAmount = spentAmount <= totalAvailable
            ? MoneyMath.subtract(totalAvailable, spentAmount)
            : 0;

        const overspentAmount = spentAmount > totalAvailable
            ? MoneyMath.subtract(spentAmount, totalAvailable)
            : 0;

        const formattedItems = Array.isArray(expenseItemsPayload) ? expenseItemsPayload.map(item => ({
            itemName: item.itemName || "HÃ³a Ä‘Æ¡n/Chá»©ng tá»« tá»•ng há»£p",
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
            note: note || "Khai bÃ¡o chi tiÃªu tá»« Organizer. Äang chá» Káº¿ toÃ¡n duyá»‡t."
        };
    }

    async _evaluateEvidencePayload(project, milestone, currentIdx, organizerId, financialReport, mediaIds) {
        let geoVerifiedCount = 0;
        if (mediaIds && mediaIds.length > 0) {
            const targetLocation = milestone.location?.coordinates?.length === 2 ? milestone.location : project.location;
            if (targetLocation && targetLocation.coordinates) {
                const [mLong, mLat] = targetLocation.coordinates;
                geoVerifiedCount = await this.mediaRepository.countGeoVerifiedMedias(mediaIds, organizerId, mLong, mLat, 500);
            }
        }

        const isFinancialMilestone = milestone.targetAmount > 0;

        let finalStatus = 'PENDING';
        let finalMilestoneStatus = MILESTONE_STATUS.PROCESSING;
        let reviewNotes = null;

        if (isFinancialMilestone) {
            reviewNotes = 'ÄÃ£ ná»™p bÃ¡o cÃ¡o chi tiÃªu. Há»‡ thá»‘ng ghi nháº­n chá» Káº¿ toÃ¡n/Admin duyá»‡t thá»§ cÃ´ng.';
        } else {
            if (geoVerifiedCount >= 1) {
                finalStatus = 'APPROVED';
                finalMilestoneStatus = MILESTONE_STATUS.COMPLETED;
                reviewNotes = `[Há»† THá»NG AUTO-PASS] XÃ¡c thá»±c thÃ nh cÃ´ng (${geoVerifiedCount} áº£nh há»£p lá»‡) táº¡i hiá»‡n trÆ°á»ng.`;
            } else {
                reviewNotes = `[Há»† THá»NG GHI NHáº¬N] Organizer ná»™p áº£nh thÆ°á»ng, khÃ´ng Ä‘áº¡t chuáº©n GPS táº¡i hiá»‡n trÆ°á»ng. Chuyá»ƒn tráº¡ng thÃ¡i chá» duyá»‡t thá»§ cÃ´ng.`;
            }
        }

        return { finalStatus, finalMilestoneStatus, reviewNotes, isFinancialMilestone };
    }

    async submitEvidence(payload) {
        const { projectId, milestoneId, organizerId, mediaIds, spentAmount, expenseItems, receiptMediaIds } = payload;

        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('KhÃ´ng tÃ¬m tháº¥y dá»± Ã¡n', 404);

        if (String(project.organizerId) !== String(organizerId)) {
            throw new AppError('Báº¡n khÃ´ng cÃ³ quyá»n thao tÃ¡c trÃªn dá»± Ã¡n nÃ y', 403);
        }

        if (project.status !== PROJECT_STATUS.EXECUTING) {
            throw new AppError('Chá»‰ cÃ³ thá»ƒ ná»™p báº±ng chá»©ng khi dá»± Ã¡n Ä‘ang trong giai Ä‘oáº¡n Thá»±c thi (EXECUTING)', 400);
        }

        const milestones = project.milestones || [];
        const currentIdx = milestones.findIndex(m => m.milestoneId === milestoneId);
        const milestone = milestones[currentIdx];

        if (!milestone) throw new AppError('Má»‘c thá»i gian khÃ´ng tá»“n táº¡i', 404);
        if (milestone.status === MILESTONE_STATUS.COMPLETED) throw new AppError('Má»‘c nÃ y Ä‘Ã£ Ä‘Æ°á»£c nghiá»‡m thu hoÃ n táº¥t', 400);

        if (currentIdx > 0) {
            const prevMilestone = milestones[currentIdx - 1];
            if (prevMilestone.status !== MILESTONE_STATUS.COMPLETED) {
                throw new AppError('NguyÃªn táº¯c cuá»‘n chiáº¿u: Má»‘c liá»n trÆ°á»›c Ä‘Ã³ pháº£i Ä‘Æ°á»£c hoÃ n thÃ nh trÆ°á»›c.', 400);
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
            project, milestone, currentIdx, organizerId, financialReport, mediaIds
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

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            const newEvidence = await this.milestoneEvidenceRepository.upsertEvidenceAtomic(
                projectId, milestoneId, newEvidencePayload, session
            );

            if (!newEvidence) throw new AppError('Má»‘c nÃ y Ä‘ang chá» duyá»‡t hoáº·c Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t. KhÃ´ng thá»ƒ ná»™p Ä‘Ãºp.', 409);

            await this.projectRepository.updateMilestoneStatus(projectId, milestoneId, evaluation.finalMilestoneStatus, session);

            // [NEW]: Náº¿u Auto-pass (má»‘c 0Ä‘, cÃ³ GPS), khÃ´ng trá»« tiá»n vÃ¬ spentAmount = 0
            if (evaluation.finalStatus === 'APPROVED') {
                dispatchEvent(DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED, { projectId, milestoneId });
                await this._syncProjectCompletionStatus(projectId, session, dispatchEvent);
            } else {
                dispatchEvent(DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL, { evidenceId: newEvidence._id, projectId });
            }

            return newEvidence;
        });
    }

    async patchEvidence(evidenceId, organizerId, payload) {
        const evidence = await this.milestoneEvidenceRepository.findById(evidenceId);
        if (!evidence) throw new AppError('KhÃ´ng tÃ¬m tháº¥y báº£n ghi', 404);
        if (String(evidence.organizerId) !== String(organizerId)) throw new AppError('KhÃ´ng cÃ³ quyá»n thao tÃ¡c', 403);
        if (evidence.status !== 'REVISION_REQUESTED') throw new AppError('Chá»‰ cÃ³ thá»ƒ ná»™p bá»• sung khi Admin cÃ³ yÃªu cáº§u sá»­a Ä‘á»•i', 400);

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
                throw new AppError('Báº¯t buá»™c pháº£i khai bÃ¡o tá»•ng sá»‘ tiá»n Ä‘Ã£ chi há»£p lá»‡.', 400);
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

        const evaluation = await this._evaluateEvidencePayload(project, milestone, currentIdx, organizerId, newFinancialReport, updatedMediaIds);

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
            let finalReviewNotes = evaluation.reviewNotes;
            if (evaluation.finalStatus === 'PENDING') {
                finalReviewNotes = `[ÄÃƒ Ná»˜P Bá»” SUNG] ${finalReviewNotes || 'Organizer Ä‘Ã£ cáº­p nháº­t bÃ¡o cÃ¡o. Äang chá» duyá»‡t láº¡i.'}`;
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

            if (evaluation.finalStatus === 'APPROVED') {
                dispatchEvent(DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED, { projectId: evidence.projectId, milestoneId: evidence.milestoneId });
                await this._syncProjectCompletionStatus(evidence.projectId, session, dispatchEvent);
            } else {
                dispatchEvent(DOMAIN_EVENTS.EVIDENCE_SUBMITTED_MANUAL, { evidenceId, projectId: evidence.projectId });
            }

            return updatedEvidence;
        });
    }

    async reviewEvidence(evidenceId, reviewerId, payload) {
        const { status, reviewNotes, approvedSpentAmount } = payload;

        if (status !== 'APPROVED' && approvedSpentAmount !== undefined) {
            throw new AppError('Chi duoc gui approvedSpentAmount khi duyet APPROVED', 400);
        }

        return await this.transactionManager.runInTransaction(async (session, dispatchEvent) => {
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

            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
                recipientIds: [String(evidence.organizerId)],
                title: `Ket qua nghiem thu Moc du an`,
                message: `Bao cao nghiem thu cua ban da duoc chuyen sang trang thai: ${status}. ${reviewNotes ? `Ghi chu: ${reviewNotes}` : ''}`
            });

            if (status === 'APPROVED') {
                dispatchEvent(DOMAIN_EVENTS.PROJECT_MILESTONE_COMPLETED, { projectId: evidence.projectId, milestoneId: evidence.milestoneId });
                await this._syncProjectCompletionStatus(evidence.projectId, session, dispatchEvent);
            }

            return updatedEvidence;
        });
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
            throw new AppError('KhÃ´ng tÃ¬m tháº¥y báº±ng chá»©ng nghiá»‡m thu', 404);
        }

        const organizerId = evidence.organizerId._id || evidence.organizerId;
        const isOwner = String(organizerId) === String(userId);
        const isPrivileged = ['admin', 'manager'].includes(userRole);

        if (!isOwner && !isPrivileged) {
            if (evidence.status !== 'APPROVED') {
                throw new AppError('Báº¡n khÃ´ng cÃ³ quyá»n xem bÃ¡o cÃ¡o nÃ y khi chÆ°a Ä‘Æ°á»£c phÃª duyá»‡t', 403);
            }
            return this.getPublicEvidence(evidence.projectId._id || evidence.projectId, evidence.milestoneId);
        }

        return evidence;
    }

    async getPublicEvidence(projectId, milestoneId) {
        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('Dá»± Ã¡n khÃ´ng tá»“n táº¡i', 404);

        const milestone = project.milestones.find(m => m.milestoneId === milestoneId);
        if (!milestone) throw new AppError('Má»‘c thá»i gian khÃ´ng tá»“n táº¡i', 404);

        const evidence = await this.milestoneEvidenceRepository.findPublicApprovedByMilestone(projectId, milestoneId);

        if (!evidence) {
            if (milestone.status === MILESTONE_STATUS.COMPLETED) {
                return { message: "Báº±ng chá»©ng Ä‘ang Ä‘Æ°á»£c há»‡ thá»‘ng tá»•ng há»£p láº¡i.", status: milestone.status };
            }
            throw new AppError('Báº±ng chá»©ng nghiá»‡m thu hiá»‡n chÆ°a sáºµn dá»¥ng hoáº·c Ä‘ang Ä‘Æ°á»£c kiá»ƒm duyá»‡t.', 404);
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
                // Æ¯á»›c lÆ°á»£ng hiá»ƒn thá»‹ tiá»n rollover cá»§a cÃ¡c má»‘c trÆ°á»›c dá»“n láº¡i
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




