import mongoose from 'mongoose';
import Project from '../../project/project.model.js';
import EscrowAccount from '../../escrow/escrow.model.js';
import Wallet from '../../wallet/wallet.model.js';
import SystemFinancial from '../../transaction/models/system-financial.model.js';
import Transaction from '../../transaction/models/transaction.model.js';
import MilestoneEvidence from '../../project/models/milestone-evidence.model.js';
import DisbursementRequest from '../../disbursement/disbursement-request.model.js';
import { PROJECT_STATUS } from '../../project/project.constant.js';

const toNumber = (value) => Number(value || 0);

class AdminFinanceRepository {
    async getOverview() {
        const [
            escrowStats,
            walletStats,
            systemFinancial,
            transactionTypeStats,
            topProjectBalances,
            recentDisbursements
        ] = await Promise.all([
            EscrowAccount.aggregate([
                {
                    $group: {
                        _id: null,
                        totalEscrowBalance: { $sum: '$availableBalance' },
                        totalDisbursed: { $sum: '$totalDisbursed' },
                        pendingDisbursementAmount: { $sum: '$pendingDisbursementAmount' },
                        retainedInProjects: { $sum: '$retainedDonations' },
                        completedRefunds: { $sum: '$completedRefunds' },
                        totalDeposited: { $sum: '$totalDeposited' }
                    }
                }
            ]),
            Wallet.aggregate([
                {
                    $group: {
                        _id: null,
                        totalWalletBalance: { $sum: '$balance' }
                    }
                }
            ]),
            SystemFinancial.findOne({ identifier: 'SYSTEM_MAIN' }).lean().exec(),
            Transaction.aggregate([
                { $match: { status: 'COMPLETED' } },
                {
                    $group: {
                        _id: '$type',
                        totalAmount: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            Project.aggregate([
                { $match: { projectType: 'FUNDED' } },
                {
                    $lookup: {
                        from: 'escrowaccounts',
                        localField: '_id',
                        foreignField: 'projectId',
                        as: 'escrow'
                    }
                },
                {
                    $project: {
                        title: 1,
                        status: 1,
                        escrow: {
                            $ifNull: [
                                { $arrayElemAt: ['$escrow', 0] },
                                {
                                    availableBalance: 0,
                                    totalDisbursed: 0,
                                    pendingDisbursementAmount: 0,
                                    retainedDonations: 0
                                }
                            ]
                        }
                    }
                },
                {
                    $project: {
                        title: 1,
                        status: 1,
                        availableBalance: '$escrow.availableBalance',
                        totalDisbursed: '$escrow.totalDisbursed',
                        pendingDisbursementAmount: '$escrow.pendingDisbursementAmount',
                        retainedDonations: '$escrow.retainedDonations'
                    }
                },
                { $sort: { availableBalance: -1, totalDisbursed: -1 } },
                { $limit: 6 }
            ]),
            DisbursementRequest.find({})
                .populate('projectId', 'title')
                .sort({ updatedAt: -1 })
                .limit(8)
                .lean()
                .exec()
        ]);

        const txStatsMap = new Map(
            transactionTypeStats.map((item) => [item._id, toNumber(item.totalAmount)])
        );

        const inboundProjectDonations =
            toNumber(txStatsMap.get('DONATION')) +
            toNumber(txStatsMap.get('DONATION_FROM_WALLET'));
        const inboundSupportDonations = toNumber(txStatsMap.get('WEB_SUPPORT_DONATION'));
        const outboundDisbursements = toNumber(txStatsMap.get('DISBURSEMENT'));
        const outboundUserRefunds = toNumber(txStatsMap.get('USER_REFUND_REQUEST'));
        const outboundWalletWithdrawals = toNumber(txStatsMap.get('WALLET_WITHDRAWAL'));

        return {
            projectEscrowBalance: toNumber(escrowStats?.[0]?.totalEscrowBalance),
            totalDisbursed: toNumber(escrowStats?.[0]?.totalDisbursed),
            pendingDisbursementAmount: toNumber(escrowStats?.[0]?.pendingDisbursementAmount),
            retainedInProjects: toNumber(escrowStats?.[0]?.retainedInProjects),
            completedRefunds: toNumber(escrowStats?.[0]?.completedRefunds),
            totalDeposited: toNumber(escrowStats?.[0]?.totalDeposited),
            userWalletBalance: toNumber(walletStats?.[0]?.totalWalletBalance),
            retainedPenaltyFund: toNumber(systemFinancial?.retainedPenaltyFund),
            charityFundBalance: toNumber(systemFinancial?.charityFundBalance),
            webSupportFundBalance: toNumber(systemFinancial?.webSupportFundBalance),
            inbound: {
                projectDonations: inboundProjectDonations,
                supportDonations: inboundSupportDonations,
                total: inboundProjectDonations + inboundSupportDonations
            },
            outbound: {
                disbursements: outboundDisbursements,
                userRefunds: outboundUserRefunds,
                walletWithdrawals: outboundWalletWithdrawals,
                total:
                    outboundDisbursements +
                    outboundUserRefunds +
                    outboundWalletWithdrawals
            },
            projectBalances: topProjectBalances.map((item) => ({
                title: item.title,
                status: item.status,
                availableBalance: toNumber(item.availableBalance),
                totalDisbursed: toNumber(item.totalDisbursed),
                pendingDisbursementAmount: toNumber(item.pendingDisbursementAmount),
                retainedDonations: toNumber(item.retainedDonations)
            })),
            recentDisbursements: recentDisbursements.map((item) => ({
                id: item._id,
                projectTitle: item.projectId?.title || 'Dự án không xác định',
                status: item.status,
                requestedAmount: toNumber(item.requestedAmount),
                approvedAmount: toNumber(item.approvedAmount),
                transferredAt: item.transferredAt || null,
                bankTransactionRef: item.bankTransactionRef || '',
                updatedAt: item.updatedAt
            }))
        };
    }

    async getFinancialSummary({ status, search, skip, limit }) {
        const matchStage = { projectType: 'FUNDED' };

        if (status) {
            matchStage.status = status;
        } else {
            const preFinanceStatuses = [
                PROJECT_STATUS.DRAFT,
                PROJECT_STATUS.UNDER_REVIEW,
                PROJECT_STATUS.PENDING_APPROVAL,
                PROJECT_STATUS.REVISION_REQUESTED,
                PROJECT_STATUS.REJECTED
            ];

            matchStage.status = { $nin: preFinanceStatuses };
        }

        if (search) matchStage.title = { $regex: search, $options: 'i' };

        const pipeline = [
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'escrowaccounts',
                    localField: '_id',
                    foreignField: 'projectId',
                    as: 'escrow'
                }
            },
            {
                $lookup: {
                    from: 'milestoneevidences',
                    let: { pid: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$projectId', '$$pid'] },
                                        { $eq: ['$status', 'PENDING'] }
                                    ]
                                }
                            }
                        },
                        { $count: 'count' }
                    ],
                    as: 'pendingEvidences'
                }
            },
            {
                $lookup: {
                    from: 'disbursementrequests',
                    let: { pid: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$projectId', '$$pid'] },
                                        { $eq: ['$status', 'PENDING'] }
                                    ]
                                }
                            }
                        },
                        { $count: 'count' }
                    ],
                    as: 'pendingDisbursements'
                }
            },
            {
                $project: {
                    title: 1,
                    status: 1,
                    targetAmount: 1,
                    organizerId: 1,
                    createdAt: 1,
                    escrowBalance: { $ifNull: [{ $arrayElemAt: ['$escrow.availableBalance', 0] }, 0] },
                    totalDeposited: { $ifNull: [{ $arrayElemAt: ['$escrow.totalDeposited', 0] }, 0] },
                    totalDisbursed: { $ifNull: [{ $arrayElemAt: ['$escrow.totalDisbursed', 0] }, 0] },
                    pendingDisbursementAmount: { $ifNull: [{ $arrayElemAt: ['$escrow.pendingDisbursementAmount', 0] }, 0] },
                    retainedDonations: { $ifNull: [{ $arrayElemAt: ['$escrow.retainedDonations', 0] }, 0] },
                    completedRefunds: { $ifNull: [{ $arrayElemAt: ['$escrow.completedRefunds', 0] }, 0] },
                    pendingEvidenceCount: { $ifNull: [{ $arrayElemAt: ['$pendingEvidences.count', 0] }, 0] },
                    pendingDisbursementCount: { $ifNull: [{ $arrayElemAt: ['$pendingDisbursements.count', 0] }, 0] }
                }
            }
        ];

        const [overview, data, totalResult] = await Promise.all([
            this.getOverview(),
            Project.aggregate(pipeline).exec(),
            Project.aggregate([{ $match: matchStage }, { $count: 'total' }]).exec()
        ]);

        const total = totalResult.length > 0 ? totalResult[0].total : 0;
        return { overview, data, total };
    }

    async getProjectDetails(projectId) {
        const pid = new mongoose.Types.ObjectId(projectId);

        const [project, escrow, evidences, requests, ledgerEntries, ledgerSummary] = await Promise.all([
            Project.findById(pid)
                .populate('organizerId', 'fullName email avatar')
                .lean()
                .exec(),
            EscrowAccount.findOne({ projectId: pid }).lean().exec(),
            MilestoneEvidence.find({ projectId: pid }).lean().exec(),
            DisbursementRequest.find({ projectId: pid }).lean().exec(),
            Transaction.find({ projectId: pid })
                .populate('donorRef', 'fullName email avatar')
                .populate('organizerRef', 'fullName email avatar')
                .sort({ createdAt: -1 })
                .limit(25)
                .lean()
                .exec(),
            Transaction.aggregate([
                {
                    $match: {
                        projectId: pid,
                        status: 'COMPLETED'
                    }
                },
                {
                    $group: {
                        _id: '$type',
                        totalAmount: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]).exec()
        ]);

        return { project, escrow, evidences, requests, ledgerEntries, ledgerSummary };
    }
}

export default AdminFinanceRepository;
