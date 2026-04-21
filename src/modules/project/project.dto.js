import { PROJECT_TYPE, PROJECT_STATUS } from "./project.constant.js";

export class ProjectDTO {
    static toPublicDetail(project, escrow = null, evidences = [], requests = []) {
        if (!project) return null;
        const data = typeof project.toObject === 'function' ? project.toObject() : { ...project };

        const sensitiveFields = [
            'aiRiskScore', 'riskFlags', 'approvedBy', 'approvedAt',
            'revisionCount', 'rejectionReason', 'pauseReason',
            'submittedAt', 'revisionRequestedAt', 'updateRequestReason',
            'updateRequestedAt', 'updateSubmittedAt', 'updateSubmittedBy'
        ];
        sensitiveFields.forEach(f => delete data[f]);

        const evidenceMap = new Map();
        evidences.forEach(e => {
            if (!evidenceMap.has(e.milestoneId)) {
                evidenceMap.set(e.milestoneId, e.status);
            }
        });

        const requestMap = new Map();
        requests.forEach(r => {
            if (!requestMap.has(r.milestoneId)) {
                requestMap.set(r.milestoneId, {
                    status: r.status,
                    id: r._id
                });
            }
        });

        if (data.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
            const financialFields = ['targetAmount', 'currentAmount', 'mvpAmount', 'budgetBreakdown'];
            financialFields.forEach(f => delete data[f]);

            if (data.milestones) {
                data.milestones = data.milestones.map(m => {
                    const { targetAmount, ...rest } = m;
                    return {
                        ...rest,
                        evidenceStatus: evidenceMap.get(m.milestoneId) || 'NOT_SUBMITTED'
                    };
                });
            }
        } else if (data.projectType === PROJECT_TYPE.FUNDED) {
            data.financialDetail = {
                totalDeposited: escrow?.totalDeposited || 0,
                totalDisbursed: escrow?.totalDisbursed || 0,
                availableBalance: escrow?.availableBalance || 0,
                pendingRefunds: escrow?.pendingRefunds || 0,
                completedRefunds: escrow?.completedRefunds || 0,
                retainedDonations: escrow?.retainedDonations || 0
            };

            if (data.milestones) {
                data.milestones = data.milestones.map(m => {
                    const req = requestMap.get(m.milestoneId);
                    return {
                        ...m,
                        evidenceStatus: evidenceMap.get(m.milestoneId) || 'NOT_SUBMITTED',
                        disbursementStatus: req ? req.status : 'NOT_STARTED',
                        disbursementId: req ? req.id : null
                    };
                });
            }

            if ([PROJECT_STATUS.COMPLETED_SUCCESSFULLY, PROJECT_STATUS.COMPLETED_PARTIAL].includes(data.status)) {
                data.finalSettlement = project.postProjectSummary || null;
            }
        }

        return data;
    }

    static toOrganizerDetail(project, escrow = null, evidences = [], requests = []) {
        if (!project) return null;
        const data = ProjectDTO.toPublicDetail(project, escrow, evidences, requests);

        const internalData = typeof project.toObject === 'function' ? project.toObject() : { ...project };
        data.rejectionReason = internalData.rejectionReason;
        data.riskFlags = internalData.riskFlags;
        data.aiRiskScore = internalData.aiRiskScore;
        data.revisionCount = internalData.revisionCount;
        data.submittedAt = internalData.submittedAt;
        data.updateRequestReason = internalData.updateRequestReason;
        data.updateRequestedAt = internalData.updateRequestedAt;
        data.updateSubmittedAt = internalData.updateSubmittedAt;

        return data;
    }
}
