import User from "../../user/user.model.js";
import Report from "../../report/report.model.js";
import Project from "../../project/project.model.js";
import EscrowAccount from "../../escrow/escrow.model.js";
import Wallet from "../../wallet/wallet.model.js";
import SystemFinancial from "../../transaction/models/system-financial.model.js";
import Transaction from "../../transaction/models/transaction.model.js";
import DisbursementRequest from "../../disbursement/disbursement-request.model.js";

const toNumber = (value) => Number(value || 0);

const sumTypes = (statsMap, types = []) =>
  types.reduce((sum, type) => sum + toNumber(statsMap.get(type)), 0);

class AdminDashboardRepository {
  async getSystemStats() {
    const [
      userStats,
      reportStats,
      projectStats,
      escrowStats,
      walletStats,
      systemFinancial,
      refundRequestStats,
      transactionTypeStats,
      topProjectBalances,
      recentDisbursements,
    ] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            banned: {
              $sum: {
                $cond: [{ $eq: ["$status", "banned"] }, 1, 0],
              },
            },
            active: {
              $sum: {
                $cond: [{ $eq: ["$status", "active"] }, 1, 0],
              },
            },
            inactive: {
              $sum: {
                $cond: [{ $eq: ["$status", "inactive"] }, 1, 0],
              },
            },
            verified: {
              $sum: {
                $cond: [{ $eq: ["$isVerified", true] }, 1, 0],
              },
            },
          },
        },
      ]),
      Report.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Project.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      EscrowAccount.aggregate([
        {
          $group: {
            _id: null,
            totalEscrowBalance: { $sum: "$availableBalance" },
            totalDisbursed: { $sum: "$totalDisbursed" },
            pendingDisbursementAmount: { $sum: "$pendingDisbursementAmount" },
            totalRetainedInProjects: { $sum: "$retainedDonations" },
            completedRefunds: { $sum: "$completedRefunds" },
          },
        },
      ]),
      Wallet.aggregate([
        {
          $group: {
            _id: null,
            totalWalletBalance: { $sum: "$balance" },
          },
        },
      ]),
      SystemFinancial.findOne({ identifier: "SYSTEM_MAIN" }).lean().exec(),
      Transaction.aggregate([
        {
          $match: {
            type: "USER_REFUND_REQUEST",
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            status: "COMPLETED",
          },
        },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Project.aggregate([
        {
          $match: {
            projectType: "FUNDED",
          },
        },
        {
          $lookup: {
            from: "escrowaccounts",
            localField: "_id",
            foreignField: "projectId",
            as: "escrow",
          },
        },
        {
          $project: {
            title: 1,
            status: 1,
            escrow: {
              $ifNull: [
                { $arrayElemAt: ["$escrow", 0] },
                {
                  availableBalance: 0,
                  totalDisbursed: 0,
                  pendingDisbursementAmount: 0,
                  retainedDonations: 0,
                },
              ],
            },
          },
        },
        {
          $project: {
            title: 1,
            status: 1,
            availableBalance: "$escrow.availableBalance",
            totalDisbursed: "$escrow.totalDisbursed",
            pendingDisbursementAmount: "$escrow.pendingDisbursementAmount",
            retainedDonations: "$escrow.retainedDonations",
          },
        },
        {
          $sort: {
            availableBalance: -1,
            totalDisbursed: -1,
          },
        },
        { $limit: 6 },
      ]),
      DisbursementRequest.find({})
        .populate("projectId", "title")
        .sort({ updatedAt: -1 })
        .limit(6)
        .lean()
        .exec(),
    ]);

    const reportsTotal = reportStats.reduce(
      (sum, item) => sum + toNumber(item.count),
      0,
    );

    const projectsTotal = projectStats.reduce(
      (sum, item) => sum + toNumber(item.count),
      0,
    );

    const refundRequestsTotal = refundRequestStats.reduce(
      (sum, item) => sum + toNumber(item.count),
      0,
    );

    const totalEscrowBalance = toNumber(escrowStats?.[0]?.totalEscrowBalance);
    const totalWalletBalance = toNumber(walletStats?.[0]?.totalWalletBalance);
    const totalDisbursed = toNumber(escrowStats?.[0]?.totalDisbursed);
    const pendingDisbursementAmount = toNumber(
      escrowStats?.[0]?.pendingDisbursementAmount,
    );
    const retainedInProjects = toNumber(
      escrowStats?.[0]?.totalRetainedInProjects,
    );
    const completedRefunds = toNumber(escrowStats?.[0]?.completedRefunds);

    const txStatsMap = new Map(
      transactionTypeStats.map((item) => [item._id, item.totalAmount]),
    );

    const inboundProjectDonations = sumTypes(txStatsMap, [
      "DONATION",
      "DONATION_FROM_WALLET",
    ]);
    const inboundSupportDonations = sumTypes(txStatsMap, [
      "WEB_SUPPORT_DONATION",
    ]);
    const outboundDisbursements = sumTypes(txStatsMap, ["DISBURSEMENT"]);
    const outboundUserRefunds = sumTypes(txStatsMap, ["USER_REFUND_REQUEST"]);
    const outboundWalletWithdrawals = sumTypes(txStatsMap, [
      "WALLET_WITHDRAWAL",
    ]);

    return {
      users: userStats[0] || {
        total: 0,
        banned: 0,
        active: 0,
        inactive: 0,
        verified: 0,
      },
      reports: {
        total: reportsTotal,
        byStatus: reportStats,
      },
      projects: {
        total: projectsTotal,
        byStatus: projectStats,
      },
      finance: {
        globalProjectWalletBalance: totalEscrowBalance,
        projectEscrowBalance: totalEscrowBalance,
        userWalletBalance: totalWalletBalance,
        totalDisbursed,
        pendingDisbursementAmount,
        retainedInProjects,
        completedRefunds,
        retainedPenaltyFund: toNumber(systemFinancial?.retainedPenaltyFund),
        charityFundBalance: toNumber(systemFinancial?.charityFundBalance),
        webSupportFundBalance: toNumber(systemFinancial?.webSupportFundBalance),
        inbound: {
          projectDonations: inboundProjectDonations,
          supportDonations: inboundSupportDonations,
          total: inboundProjectDonations + inboundSupportDonations,
        },
        outbound: {
          disbursements: outboundDisbursements,
          userRefunds: outboundUserRefunds,
          walletWithdrawals: outboundWalletWithdrawals,
          total:
            outboundDisbursements +
            outboundUserRefunds +
            outboundWalletWithdrawals,
        },
        projectBalances: topProjectBalances.map((item) => ({
          title: item.title,
          status: item.status,
          availableBalance: toNumber(item.availableBalance),
          totalDisbursed: toNumber(item.totalDisbursed),
          pendingDisbursementAmount: toNumber(item.pendingDisbursementAmount),
          retainedDonations: toNumber(item.retainedDonations),
        })),
        recentDisbursements: recentDisbursements.map((item) => ({
          id: item._id,
          projectTitle: item.projectId?.title || "Dự án không xác định",
          status: item.status,
          requestedAmount: toNumber(item.requestedAmount),
          approvedAmount: toNumber(item.approvedAmount),
          transferredAt: item.transferredAt || null,
          bankTransactionRef: item.bankTransactionRef || "",
          updatedAt: item.updatedAt,
        })),
      },
      refunds: {
        total: refundRequestsTotal,
        byStatus: refundRequestStats,
      },
    };
  }
}

export default AdminDashboardRepository;
