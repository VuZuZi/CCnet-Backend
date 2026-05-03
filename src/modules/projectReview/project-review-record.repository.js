import ProjectReviewRecord from "./project-review-record.model.js";

class ProjectReviewRecordRepository {
  async create(payload, session = null) {
    const docs = await ProjectReviewRecord.create([payload], session ? { session } : {});
    return docs[0].toObject();
  }

  async markTransitionApplied(recordId, payload = {}) {
    return ProjectReviewRecord.findByIdAndUpdate(
      recordId,
      {
        $set: {
          ...payload,
          transitionAuditStatus: "APPLIED",
          transitionAppliedAt: new Date(),
          transitionFailedAt: null,
          transitionErrorCode: null,
          transitionErrorMessageSafe: null,
        },
      },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  }

  async markTransitionFailed(recordId, payload = {}) {
    return ProjectReviewRecord.findByIdAndUpdate(
      recordId,
      {
        $set: {
          ...payload,
          transitionFailedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  }

  async findByProject(projectId, { limit = 50 } = {}) {
    return ProjectReviewRecord.find({ projectId })
      .populate("adminId", "fullName email avatar role")
      .populate("aiReviewRunId", "status overallRiskLevel overallRiskScore confidence summary createdAt completedAt failedAt")
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(100, Number(limit) || 50)))
      .lean()
      .exec();
  }
}

export default ProjectReviewRecordRepository;
