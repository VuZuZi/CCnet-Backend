import VolunteerReview from "../models/volunteer-review.model.js";

class VolunteerReviewRepository {
  _applySession(query, session = null) {
    if (session) {
      query = query.session(session);
    }
    return query;
  }

  async findById(id, session = null) {
    let query = VolunteerReview.findById(id)
      .populate("volunteerId", "fullName email avatar")
      .populate("attendanceId");

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async findByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerReview.find({ projectId, milestoneId })
      .populate("volunteerId", "fullName email avatar")
      .populate("attendanceId")
      .sort({ createdAt: 1 });

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async bulkUpsert(records = [], session = null) {
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    await VolunteerReview.bulkWrite(
      records.map((item) => ({
        updateOne: {
          filter: {
            projectId: item.projectId,
            milestoneId: item.milestoneId,
            volunteerId: item.volunteerId,
          },
          update: {
            $setOnInsert: item,
          },
          upsert: true,
        },
      })),
      { ordered: false, session }
    );

    const projectId = records[0]?.projectId;
    const milestoneId = records[0]?.milestoneId;

    return this.findByProjectAndMilestone(projectId, milestoneId, session);
  }

  async updateById(id, updateData, session = null) {
    let query = VolunteerReview.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("volunteerId", "fullName email avatar")
      .populate("attendanceId");

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async findPendingExpired(limit = 100, session = null) {
    let query = VolunteerReview.find({
      status: "PENDING",
      deadlineAt: { $lte: new Date() },
    })
      .sort({ deadlineAt: 1 })
      .limit(Number(limit) || 100);

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async countByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerReview.countDocuments({ projectId, milestoneId });
    query = this._applySession(query, session);
    return query.exec();
  }

  async countPendingByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerReview.countDocuments({
      projectId,
      milestoneId,
      status: "PENDING",
    });
    query = this._applySession(query, session);
    return query.exec();
  }
}

export default VolunteerReviewRepository;