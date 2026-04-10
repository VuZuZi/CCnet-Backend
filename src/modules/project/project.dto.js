import { PROJECT_TYPE } from "./project.constant.js";

export class ProjectDTO {
    static toPublicDetail(project, escrow = null) {
        if (!project) return null;
        const data = typeof project.toObject === 'function' ? project.toObject() : { ...project };

        const sensitiveFields = [
            'aiRiskScore', 'riskFlags', 'approvedBy', 'approvedAt',
            'revisionCount', 'rejectionReason', 'pauseReason',
            'submittedAt', 'revisionRequestedAt'
        ];
        sensitiveFields.forEach(f => delete data[f]);

        if (data.projectType === PROJECT_TYPE.VOLUNTEER_ONLY) {
            const financialFields = [
                'targetAmount', 'currentAmount', 'mvpAmount',
                'budgetBreakdown', 'surplusPolicy', 'carryOverProjectId'
            ];
            financialFields.forEach(f => delete data[f]);

            if (data.milestones) {
                data.milestones = data.milestones.map(m => {
                    const { targetAmount, ...rest } = m;
                    return rest;
                });
            }
        } else if (data.projectType === PROJECT_TYPE.FUNDED && escrow) {
            data.financialDetail = {
                availableBalance: escrow.availableBalance || 0,
                pendingRefunds: escrow.pendingRefunds || 0,
                totalDeposited: escrow.totalDeposited || 0,
                totalDisbursed: escrow.totalDisbursed || 0
            };
        }

        return data;
    }

    static toOrganizerDetail(project, escrow = null) {
        if (!project) return null;
        const data = ProjectDTO.toPublicDetail(project, escrow);

        const internalData = typeof project.toObject === 'function' ? project.toObject() : { ...project };
        data.rejectionReason = internalData.rejectionReason;
        data.riskFlags = internalData.riskFlags;
        data.aiRiskScore = internalData.aiRiskScore;

        return data;
    }
}