import mongoose from 'mongoose';
import Project from '../../project/project.model.js';
import EscrowAccount from '../../escrow/escrow.model.js';
import MilestoneEvidence from '../../project/models/milestone-evidence.model.js';
import DisbursementRequest from '../../disbursement/disbursement-request.model.js';
import { PROJECT_STATUS } from '../../project/project.constant.js';

class AdminFinanceRepository {
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
                    totalDisbursed: { $ifNull: [{ $arrayElemAt: ['$escrow.totalDisbursed', 0] }, 0] },
                    pendingEvidenceCount: { $ifNull: [{ $arrayElemAt: ['$pendingEvidences.count', 0] }, 0] },
                    pendingDisbursementCount: { $ifNull: [{ $arrayElemAt: ['$pendingDisbursements.count', 0] }, 0] }
                }
            }
        ];

        const [data, totalResult] = await Promise.all([
            Project.aggregate(pipeline).exec(),
            Project.aggregate([{ $match: matchStage }, { $count: 'total' }]).exec()
        ]);

        const total = totalResult.length > 0 ? totalResult[0].total : 0;
        return { data, total };
    }

    async getProjectDetails(projectId) {
        const pid = new mongoose.Types.ObjectId(projectId);

        const [project, escrow, evidences, requests] = await Promise.all([
            Project.findById(pid)
                .populate('organizerId', 'fullName email avatar')
                .lean()
                .exec(),
            EscrowAccount.findOne({ projectId: pid }).lean().exec(),
            MilestoneEvidence.find({ projectId: pid }).lean().exec(),
            DisbursementRequest.find({ projectId: pid }).lean().exec()
        ]);

        return { project, escrow, evidences, requests };
    }
}

export default AdminFinanceRepository;