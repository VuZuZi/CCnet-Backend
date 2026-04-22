import VolunteerReview from "../models/volunteer-review.model.js";

class VolunteerReviewRepository {
  _applySession(query, session = null) {
    if (session) query = query.session(session);
    return query;
  }

  async findById(id, session = null) {
    let query = VolunteerReview.findById(id).populate(
      "volunteerId",
      "fullName email avatar"
    );

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async findByProject(projectId, session = null) {
    let query = VolunteerReview.find({ projectId })
      .populate("volunteerId", "fullName email avatar")
      .sort({ createdAt: 1 });

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async existsByProject(projectId, session = null) {
    let query = VolunteerReview.exists({ projectId });
    query = this._applySession(query, session);
    const result = await query;
    return Boolean(result);
  }

  async findReviewedByVolunteer(volunteerId, session = null) {
    let query = VolunteerReview.find({
      volunteerId,
      status: "REVIEWED",
    }).sort({ reviewedAt: -1, updatedAt: -1, createdAt: -1 });

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async findDistinctReviewedProjectIdsByVolunteer(volunteerId, session = null) {
    let query = VolunteerReview.distinct("projectId", {
      volunteerId,
      status: "REVIEWED",
    });

    query = this._applySession(query, session);
    return query.exec();
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
    return this.findByProject(projectId, session);
  }

  async updateById(id, updateData, session = null) {
    let query = VolunteerReview.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("volunteerId", "fullName email avatar");

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async deleteByProject(projectId, session = null) {
    let query = VolunteerReview.deleteMany({ projectId });
    query = this._applySession(query, session);
    return query.exec();
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

  async countByProject(projectId, session = null) {
    let query = VolunteerReview.countDocuments({ projectId });
    query = this._applySession(query, session);
    return query.exec();
  }
}

export default VolunteerReviewRepository;