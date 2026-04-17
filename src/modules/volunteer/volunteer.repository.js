// @ts-nocheck
import mongoose from "mongoose";
import Volunteer from "./volunteer.model.js";

class VolunteerRepository {
  constructor() {
    this.model = Volunteer;
  }

  _applySession(query, session = null) {
    if (session) {
      query = query.session(session);
    }

    return query;
  }

  async exists(volunteerId, opportunityId, session = null) {
    try {
      const query = this.model.exists({ volunteerId, opportunityId });
      return await this._applySession(query, session);
    } catch (error) {
      console.error("❌ [Repository] exists error:", error);
      throw error;
    }
  }

  async find(filter, options = {}, session = null) {
    try {
      let query = this.model.find(filter);

      if (options.sort) {
        query = query.sort(options.sort);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.populate) {
        query = query.populate(options.populate, "fullName email avatar");
      }

      query = this._applySession(query, session);

      const results = await query.lean();
      return results;
    } catch (error) {
      console.error("❌ [Repository] find error:", error);
      throw error;
    }
  }

  async create(data, session = null) {
    try {
      if (!data.skills) throw new Error("skills is required");
      if (!data.motivation) throw new Error("motivation is required");
      if (!data.availability) throw new Error("availability is required");

      if (session) {
        const docs = await this.model.create([data], { session });
        return docs[0];
      }

      return await this.model.create(data);
    } catch (error) {
      console.error("❌ [Repository] create error:", error);
      throw error;
    }
  }

  async application({ volunteerId, opportunityId }, session = null) {
    try {
      let query = this.model.findOne({
        volunteerId,
        opportunityId,
        status: { $ne: "CANCELLED" },
      });

      query = this._applySession(query, session);
      return await query;
    } catch (error) {
      console.error("❌ [Repository] application error:", error);
      throw error;
    }
  }

  async findOne(filter, session = null) {
    try {
      let query = this.model.findOne(filter);
      query = this._applySession(query, session);
      return await query;
    } catch (error) {
      console.error("❌ [Repository] findOne error:", error);
      throw error;
    }
  }

  async findById(id, session = null) {
    try {
      let query = this.model.findById(id);
      query = this._applySession(query, session);
      return await query;
    } catch (error) {
      console.error("❌ [Repository] findById error:", error);
      throw error;
    }
  }

  async update(id, updateData, changerId = null, session = null) {
    try {
      const dataToUpdate = { ...updateData };

      if (changerId) {
        dataToUpdate.changerId = changerId;
      }

      let query = this.model.findByIdAndUpdate(
        id,
        { $set: dataToUpdate },
        { new: true, runValidators: true }
      );

      query = this._applySession(query, session);
      return await query;
    } catch (error) {
      console.error("❌ [Repository] update error:", error);
      throw error;
    }
  }

  async delete(id, session = null) {
    try {
      let query = this.model.findByIdAndDelete(id);
      query = this._applySession(query, session);
      return await query;
    } catch (error) {
      console.error("❌ [Repository] delete error:", error);
      throw error;
    }
  }

  async findByProject(opportunityId, status = null, limit = null, cursor = null, session = null) {
    try {
      const filter = {
        opportunityId: new mongoose.Types.ObjectId(opportunityId),
      };

      if (status) {
        filter.status = status;
      } else {
        filter.status = { $ne: "CANCELLED" };
      }

      if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      let query = this.model
        .find(filter)
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 });

      if (limit && Number(limit) > 0) {
        query = query.limit(Number(limit));
      }

      query = this._applySession(query, session);
      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByProject error:", error);
      throw error;
    }
  }

  async findByVolPending(opportunityId, session = null) {
    try {
      let query = this.model
        .find({
          opportunityId,
          status: "PENDING",
        })
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 });

      query = this._applySession(query, session);
      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByVolPending error:", error);
      throw error;
    }
  }

  async findByVolApproved(opportunityId, session = null) {
    try {
      let query = this.model
        .find({
          opportunityId,
          status: "APPROVED",
        })
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 });

      query = this._applySession(query, session);
      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByVolApproved error:", error);
      throw error;
    }
  }

  async findByVolRejected(opportunityId, session = null) {
    try {
      let query = this.model
        .find({
          opportunityId,
          status: "REJECTED",
        })
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 });

      query = this._applySession(query, session);
      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByVolRejected error:", error);
      throw error;
    }
  }

  async findByUser(volunteerId, limit = null, cursor = null, session = null) {
    try {
      const filter = { volunteerId };

      if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      let query = this.model
        .find(filter)
        .populate("opportunityId", "title description organizerId status")
        .sort({ createdAt: -1 });

      if (limit && Number(limit) > 0) {
        query = query.limit(Number(limit));
      }

      query = this._applySession(query, session);
      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByUser error:", error);
      throw error;
    }
  }

  async countByUser(volunteerId, session = null) {
    try {
      let query = this.model.countDocuments({ volunteerId });
      query = this._applySession(query, session);
      return await query;
    } catch (error) {
      console.error("❌ [Repository] countByUser error:", error);
      throw error;
    }
  }

  async findByUserWithProject(volunteerId, session = null) {
    try {
      let query = this.model
        .find({ volunteerId })
        .populate({
          path: "opportunityId",
          select:
            "title coverMedia category targetAmount currentAmount location status organizerId startDate endDate stats createdAt",
          populate: {
            path: "organizerId",
            select: "fullName avatar",
          },
        })
        .sort({ createdAt: -1 });

      query = this._applySession(query, session);
      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByUserWithProject error:", error);
      throw error;
    }
  }
}

export default VolunteerRepository;