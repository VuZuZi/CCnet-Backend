import mongoose from "mongoose";
import VolunteerAttendance from "../models/volunteer-attendance.model.js";

class VolunteerAttendanceRepository {
  _applySession(query, session = null) {
    if (session) {
      query = query.session(session);
    }
    return query;
  }

  async findById(id, session = null) {
    let query = VolunteerAttendance.findById(id)
      .populate("volunteerId", "fullName email avatar")
      .populate("confirmedBy", "fullName email avatar");

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async findByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerAttendance.find({ projectId, milestoneId })
      .populate("volunteerId", "fullName email avatar")
      .populate("confirmedBy", "fullName email avatar")
      .sort({ createdAt: 1 });

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async findByProjectAndMilestoneRaw(projectId, milestoneId, session = null) {
    let query = VolunteerAttendance.find({ projectId, milestoneId }).sort({
      createdAt: 1,
    });

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async bulkUpsert(records = [], session = null) {
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    await VolunteerAttendance.bulkWrite(
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
    let query = VolunteerAttendance.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("volunteerId", "fullName email avatar")
      .populate("confirmedBy", "fullName email avatar");

    query = this._applySession(query, session);
    return query.lean().exec();
  }

  async countByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerAttendance.countDocuments({ projectId, milestoneId });
    query = this._applySession(query, session);
    return query.exec();
  }

  async countAttendedByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerAttendance.countDocuments({
      projectId,
      milestoneId,
      status: "ATTENDED",
    });
    query = this._applySession(query, session);
    return query.exec();
  }

  async countPendingByProjectAndMilestone(projectId, milestoneId, session = null) {
    let query = VolunteerAttendance.countDocuments({
      projectId,
      milestoneId,
      status: "PENDING",
    });
    query = this._applySession(query, session);
    return query.exec();
  }
}

export default VolunteerAttendanceRepository;