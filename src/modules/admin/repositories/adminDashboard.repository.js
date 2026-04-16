import User from "../../user/user.model.js";
import Report from "../../report/report.model.js";
import Project from "../../project/project.model.js";

class AdminDashboardRepository {
  async getSystemStats() {
    const [userStats, reportStats, projectStats] = await Promise.all([
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
    ]);

    const reportsTotal = reportStats.reduce(
      (sum, item) => sum + Number(item.count || 0),
      0
    );

    const projectsTotal = projectStats.reduce(
      (sum, item) => sum + Number(item.count || 0),
      0
    );

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
    };
  }
}

export default AdminDashboardRepository;