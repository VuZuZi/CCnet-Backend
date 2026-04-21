import AppError from '../../../core/AppError.js';

class AdminFinanceService {
    constructor({ adminFinanceRepository }) {
        this.adminFinanceRepository = adminFinanceRepository;
    }

    async getProjectFinancialSummary(query) {
        const { page, limit, status, search } = query;
        const skip = (page - 1) * limit;

        const { data, total } = await this.adminFinanceRepository.getFinancialSummary({ status, search, skip, limit });

        return {
            projects: data,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async getProjectFinancialDetail(projectId) {
        const { project, escrow, evidences, requests } = await this.adminFinanceRepository.getProjectDetails(projectId);

        if (!project) {
            throw new AppError('Không tìm thấy dự án', 404);
        }

        const milestones = (project.milestones || []).map(m => {
            const mEvidences = evidences.filter(e => String(e.milestoneId) === String(m.milestoneId));
            const mRequests = requests.filter(r => String(r.milestoneId) === String(m.milestoneId));

            return {
                ...m,
                evidences: mEvidences,
                disbursementRequests: mRequests
            };
        });

        return {
            project: {
                id: project._id,
                title: project.title,
                status: project.status,
                projectType: project.projectType,
                targetAmount: project.targetAmount,
                organizer: project.organizerId
            },
            escrow: escrow || { availableBalance: 0, totalDisbursed: 0, pendingDisbursementAmount: 0 },
            milestones
        };
    }
}

export default AdminFinanceService;