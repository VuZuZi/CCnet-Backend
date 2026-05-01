import AppError from '../../../core/AppError.js';

class AdminFinanceService {
    constructor({ adminFinanceRepository }) {
        this.adminFinanceRepository = adminFinanceRepository;
    }

    async getProjectFinancialSummary(query) {
        const { page, limit, status, search } = query;
        const skip = (page - 1) * limit;

        const { overview, data, total } = await this.adminFinanceRepository.getFinancialSummary({ status, search, skip, limit });

        return {
            overview,
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
        const { project, escrow, evidences, requests, ledgerEntries, ledgerSummary } =
            await this.adminFinanceRepository.getProjectDetails(projectId);

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

        const ledgerSummaryMap = new Map(
            (ledgerSummary || []).map((item) => [item._id, item])
        );

        const moneyFlow = {
            totalProjectDonations:
                Number(ledgerSummaryMap.get('DONATION')?.totalAmount || 0) +
                Number(ledgerSummaryMap.get('DONATION_FROM_WALLET')?.totalAmount || 0),
            totalRefundedToUsers: Number(
                ledgerSummaryMap.get('USER_REFUND_REQUEST')?.totalAmount || 0
            ),
            totalRetainedInProject: Number(
                ledgerSummaryMap.get('RETAINED_DONATION')?.totalAmount || 0
            ),
            totalDisbursed: Number(
                ledgerSummaryMap.get('DISBURSEMENT')?.totalAmount || 0
            ),
        };

        return {
            project: {
                id: project._id,
                title: project.title,
                status: project.status,
                projectType: project.projectType,
                targetAmount: project.targetAmount,
                organizer: project.organizerId
            },
            escrow: escrow || {
                availableBalance: 0,
                totalDeposited: 0,
                totalDisbursed: 0,
                pendingDisbursementAmount: 0,
                retainedDonations: 0,
                completedRefunds: 0
            },
            milestones,
            moneyFlow,
            ledgerEntries: (ledgerEntries || []).map((entry) => ({
                id: entry._id,
                type: entry.type,
                status: entry.status,
                amount: entry.amount,
                grossAmount: entry.grossAmount,
                netAmount: entry.netAmount,
                donor: entry.donorRef || null,
                organizer: entry.organizerRef || null,
                message: entry.message || '',
                bankTransactionRef: entry.bankTransactionRef || '',
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt
            }))
        };
    }
}

export default AdminFinanceService;
