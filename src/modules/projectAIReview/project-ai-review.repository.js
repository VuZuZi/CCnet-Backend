import ProjectAIReviewRun from "./project-ai-review.model.js";
import { PROJECT_AI_REVIEW_STATUS } from "./project-ai-review.constant.js";

class ProjectAIReviewRepository {
  async create(payload, session = null) {
    const docs = await ProjectAIReviewRun.create([payload], session ? { session } : {});
    return docs[0].toObject();
  }

  async findById(id, session = null) {
    return ProjectAIReviewRun.findById(id).session(session).lean().exec();
  }

  async findByProject(projectId, { limit = 20 } = {}) {
    return ProjectAIReviewRun.find({ projectId })
      .sort({ submissionVersion: -1, createdAt: -1 })
      .limit(Math.max(1, Math.min(100, Number(limit) || 20)))
      .lean()
      .exec();
  }

  async findLatest(projectId) {
    return ProjectAIReviewRun.findOne({ projectId })
      .sort({ submissionVersion: -1, createdAt: -1 })
      .lean()
      .exec();
  }

  async findLatestCurrent(projectId, submissionVersion, projectSnapshotHash) {
    return ProjectAIReviewRun.findOne({
      projectId,
      submissionVersion,
      projectSnapshotHash,
      status: { $ne: PROJECT_AI_REVIEW_STATUS.STALE },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async markStaleForProject(projectId, { excludeRunId = null } = {}, session = null) {
    const filter = {
      projectId,
      status: {
        $in: [
          PROJECT_AI_REVIEW_STATUS.PENDING,
          PROJECT_AI_REVIEW_STATUS.RUNNING,
          PROJECT_AI_REVIEW_STATUS.COMPLETED,
          PROJECT_AI_REVIEW_STATUS.FAILED,
        ],
      },
    };

    if (excludeRunId) {
      filter._id = { $ne: excludeRunId };
    }

    return ProjectAIReviewRun.updateMany(
      filter,
      { $set: { status: PROJECT_AI_REVIEW_STATUS.STALE } },
      session ? { session } : {}
    ).exec();
  }

  async updateById(id, update, session = null) {
    return ProjectAIReviewRun.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true, session }
    )
      .lean()
      .exec();
  }

  async markRunning(id) {
    return ProjectAIReviewRun.findOneAndUpdate(
      { _id: id, status: PROJECT_AI_REVIEW_STATUS.PENDING },
      {
        $set: {
          status: PROJECT_AI_REVIEW_STATUS.RUNNING,
          startedAt: new Date(),
          errorCode: null,
          errorMessageSafe: null,
        },
      },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  }

  async markCompleted(id, output) {
    return this.updateById(id, {
      status: PROJECT_AI_REVIEW_STATUS.COMPLETED,
      completedAt: new Date(),
      failedAt: null,
      errorCode: null,
      errorMessageSafe: null,
      overallRiskLevel: output.overallRiskLevel,
      overallRiskScore: output.overallRiskScore,
      confidence: output.confidence,
      summary: output.summary,
      findings: output.findings,
      checklistSuggestions: output.checklistSuggestions,
      normalizedOutput: output,
    });
  }

  async markFailed(id, { errorCode, errorMessageSafe }) {
    return this.updateById(id, {
      status: PROJECT_AI_REVIEW_STATUS.FAILED,
      failedAt: new Date(),
      errorCode,
      errorMessageSafe,
    });
  }
}

export default ProjectAIReviewRepository;
