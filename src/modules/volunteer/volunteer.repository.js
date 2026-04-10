// @ts-nocheck
import mongoose from "mongoose";
import Volunteer from "./volunteer.model.js";

class VolunteerRepository {
  constructor() {
    this.model = Volunteer;
  }

  async exists(volunteerId, opportunityId) {
    try {
      return await this.model.exists({ volunteerId, opportunityId });
    } catch (error) {
      console.error("❌ [Repository] exists error:", error);
      throw error;
    }
  }

  async find(filter, options = {}) {
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

      const results = await query.lean();
      return results;
    } catch (error) {
      console.error("❌ [Repository] find error:", error);
      throw error;
    }
  }

  async create(data) {
    try {
      if (!data.skills) throw new Error("skills is required");
      if (!data.motivation) throw new Error("motivation is required");
      if (!data.availability) throw new Error("availability is required");

      const result = await this.model.create(data);
      return result;
    } catch (error) {
      console.error("❌ [Repository] create error:", error);
      throw error;
    }
  }

  async application({ volunteerId, opportunityId }) {
    try {
      const application = await this.model.findOne({
        volunteerId,
        opportunityId,
        status: { $ne: "CANCELLED" },
      });
      return application;
    } catch (error) {
      console.error("❌ [Repository] application error:", error);
      throw error;
    }
  }

  async findOne(filter) {
    try {
      return await this.model.findOne(filter);
    } catch (error) {
      console.error("❌ [Repository] findOne error:", error);
      throw error;
    }
  }

  async findById(id) {
    try {
      return await this.model.findById(id);
    } catch (error) {
      console.error("❌ [Repository] findById error:", error);
      throw error;
    }
  }

  async update(id, updateData, changerId = null) {
    try {
      const dataToUpdate = { ...updateData };

      if (changerId) {
        dataToUpdate.changerId = changerId;
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        { $set: dataToUpdate },
        { new: true, runValidators: true }
      );

      return updated;
    } catch (error) {
      console.error("❌ [Repository] update error:", error);
      throw error;
    }
  }

  async delete(id) {
    try {
      return await this.model.findByIdAndDelete(id);
    } catch (error) {
      console.error("❌ [Repository] delete error:", error);
      throw error;
    }
  }

  async findByProject(opportunityId, status = null, limit = null, cursor = null) {
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

      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByProject error:", error);
      throw error;
    }
  }

  async findByVolPending(opportunityId) {
    try {
      return await this.model
        .find({
          opportunityId,
          status: "PENDING",
        })
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error("❌ [Repository] findByVolPending error:", error);
      throw error;
    }
  }

  async findByVolApproved(opportunityId) {
    try {
      return await this.model
        .find({
          opportunityId,
          status: "APPROVED",
        })
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error("❌ [Repository] findByVolApproved error:", error);
      throw error;
    }
  }

  async findByVolRejected(opportunityId) {
    try {
      return await this.model
        .find({
          opportunityId,
          status: "REJECTED",
        })
        .populate("volunteerId", "fullName email avatar")
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error("❌ [Repository] findByVolRejected error:", error);
      throw error;
    }
  }

  async findByUser(volunteerId, limit = null, cursor = null) {
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

      return await query.lean();
    } catch (error) {
      console.error("❌ [Repository] findByUser error:", error);
      throw error;
    }
  }

  async countByUser(volunteerId) {
    try {
      return await this.model.countDocuments({ volunteerId });
    } catch (error) {
      console.error("❌ [Repository] countByUser error:", error);
      throw error;
    }
  }

  async findByUserWithProject(volunteerId) {
    try {
      return await this.model
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
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error("❌ [Repository] findByUserWithProject error:", error);
      throw error;
    }
  }
}

export default VolunteerRepository;

