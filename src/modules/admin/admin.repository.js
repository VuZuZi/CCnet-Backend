// backend/src/modules/admin/admin.repository.js
import User from "../user/user.model.js";
import Report from "../report/report.model.js";
import Post from "../communitypost/post.model.js";
import Project from "../project/project.model.js";
import Notification from "../notification/notification.model.js";
import { PROJECT_STATUS } from "../project/project.constant.js";
import mongoose from "mongoose";

class AdminRepository {
  constructor() {
    this.User = User;
    this.Report = Report;
    this.Post = Post;
    this.Project = Project;
    this.Notification = Notification;
  }

  // ==================== STATS ====================
  async getSystemStats() {
    const [userStats, reportStats, postCount, projectCount] = await Promise.all([
      this.User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            banned: { $sum: { $cond: ["$isActive", 0, 1] } }, // isActive = false là banned
            verified: { $sum: { $cond: ["$isVerified", 1, 0] } },
          },
        },
      ]),
      this.Report.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      this.Post.countDocuments(),
      this.Project.countDocuments(),
    ]);

    return {
      users: userStats[0] || { total: 0, banned: 0, verified: 0 },
      reports: reportStats,
      posts: { total: postCount },
      projects: { total: projectCount },
    };
  }

  // ==================== USERS ====================
  async findAllUsers() {
    return await this.User.aggregate([
      {
        $lookup: {
          from: "projects",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organizerId", "$$userId"] },
                    { $eq: ["$status", PROJECT_STATUS.COMPLETED] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "completedProjectsAgg",
        },
      },
      {
        $lookup: {
          from: "volunteers",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$volunteerId", "$$userId"] },
                    { $eq: ["$status", "APPROVED"] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "volunteerJoinsAgg",
        },
      },
      {
        $addFields: {
          completedProjectsCount: {
            $ifNull: [{ $arrayElemAt: ["$completedProjectsAgg.count", 0] }, 0],
          },
          volunteersJoinedCount: {
            $ifNull: [{ $arrayElemAt: ["$volunteerJoinsAgg.count", 0] }, 0],
          },
        },
      },
      {
        $project: {
          password: 0,
          googleId: 0,
          avatarPublicId: 0,
          coverPhotoPublicId: 0,
          completedProjectsAgg: 0,
          volunteerJoinsAgg: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
  }

  async findUserById(id) {
    return await this.User.findById(id).select("-password");
  }

  async updateUser(id, updateData) {
    return await this.User.findByIdAndUpdate(id, updateData, { new: true })
      .select("_id fullName email avatar role isActive isVerified")
      .lean();
  }

  async toggleUserBan(userId) {
    const user = await this.User.findById(userId);
    if (!user) return null;

    return await this.User.findByIdAndUpdate(
      userId,
      { $set: { isActive: !user.isActive } },
      { new: true }
    ).select("_id fullName email avatar role isActive isVerified");
  }

  async setUserVerified(userId, isVerified) {
    if (!mongoose.Types.ObjectId.isValid(userId)) return null;

    return await this.User.findByIdAndUpdate(
      userId,
      { $set: { isVerified } },
      { new: true }
    ).select("_id fullName email avatar role isActive isVerified");
  }

  // ==================== PROJECTS ====================
  async findAllProjects() {
    return await this.Project.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      { $unwind: "$organizer" },
      {
        $lookup: {
          from: "projects",
          localField: "organizerId",
          foreignField: "organizerId",
          as: "organizerProjects",
        },
      },
      {
        $addFields: {
          "organizer.projectCount": { $size: "$organizerProjects" },
        },
      },
      {
        $project: {
          organizerProjects: 0,
          "organizer.password": 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
  }

  async findProjectById(projectId) {
    return await this.Project.findById(projectId);
  }

  async updateProjectStatus(projectId, status) {
    return await this.Project.findByIdAndUpdate(
      projectId,
      { $set: { status } },
      { new: true }
    ).select("status title organizerId targetAmount currentAmount stats needsVolunteers");
  }

  async deleteProject(projectId) {
    return await this.Project.findByIdAndDelete(projectId);
  }

  // ==================== REPORTS ====================
  async findAllReports() {
    return await this.Report.find()
      .populate("reporter_ref", "username email")
      .populate({
        path: "target_ref",
        select: "content title",
      })
      .sort({ createdAt: -1 });
  }

  async findReportById(reportId) {
    return await this.Report.findById(reportId).populate("target_ref");
  }

  async updateReport(reportId, updateData) {
    return await this.Report.findByIdAndUpdate(reportId, updateData, { new: true });
  }

  async deleteReport(reportId) {
    return await this.Report.findByIdAndDelete(reportId);
  }

  // ==================== NOTIFICATIONS ====================
  async createNotification(notificationData) {
    const notification = new this.Notification({
      title: notificationData.title,
      message: notificationData.message,
      recipient: notificationData.recipient || "all",
      sender: notificationData.sender || "system",
    });
    return await notification.save();
  }

  // ==================== POSTS ====================
  async deletePost(postId) {
    return await this.Post.findByIdAndDelete(postId);
  }

  async findPostById(postId) {
    return await this.Post.findById(postId);
  }
}

export default AdminRepository;