// backend/src/modules/volunteer/volunteer.repository.js
import Volunteer from './volunteer.model.js';

class VolunteerRepository {
  constructor() {
    this.model = Volunteer;
  }

  // CHECK EXIST
  async exists(volunteerId, opportunityId) {
    try {
      return await this.model.exists({ volunteerId, opportunityId });
    } catch (error) {
      console.error('❌ [Repository] exists error:', error);
      throw error;
    }
  }

  // THÊM METHOD find - QUAN TRỌNG
  async find(filter, options = {}) {
    try {
      let query = this.model.find(filter);

      // Sắp xếp
      if (options.sort) {
        query = query.sort(options.sort);
      }

      // Giới hạn số lượng
      if (options.limit) {
        query = query.limit(options.limit);
      }

      // Populate dữ liệu liên quan
      if (options.populate) {
        query = query.populate(options.populate, 'fullName email avatar');
      }

      const results = await query.lean();
      return results;
    } catch (error) {
      console.error('❌ [Repository] find error:', error);
      throw error;
    }
  }

  // create đơn apply
  async create(data) {
    try {
      if (!data.skills) throw new Error('skills is required');
      if (!data.motivation) throw new Error('motivation is required');
      if (!data.availability) throw new Error('availability is required');

      const result = await this.model.create(data);
      return result;
    } catch (error) {
      console.error("❌ [Repository] Create error:", error);
      throw error;
    }
  }

  // method application để check status
  async application({ volunteerId, opportunityId }) {
    try {
      const application = await this.model.findOne({
        volunteerId: volunteerId,
        opportunityId: opportunityId,
        status: { $ne: 'CANCELLED' }
      });
      return application;
    } catch (error) {
      console.error('❌ [Repository] application error:', error);
      throw error;
    }
  }

  // FIND ONE
  async findOne(filter) {
    try {
      return await this.model.findOne(filter);
    } catch (error) {
      console.error('❌ [Repository] findOne error:', error);
      throw error;
    }
  }

  // FIND BY ID - sửa duplicate
  async findById(id) {
    try {
      return await this.model.findById(id);
    } catch (error) {
      console.error('❌ [Repository] findById error:', error);
      throw error;
    }
  }

  // UPDATE - sửa cú pháp
  async update(id, updateData, changerId = null) {
    try {
      const dataToUpdate = { ...updateData };
      if (changerId) {
        dataToUpdate.changerId = changerId;
      }
      const updated = await this.model.findByIdAndUpdate(
          id,
          dataToUpdate,
          { new: true, runValidators: true }
      );
      return updated;
    } catch (error) {
      console.error('❌ [Repository] update error:', error);
      throw error;
    }
  }

  // DELETE - sửa logic
  async delete(id) {
    try {
      return await this.model.findByIdAndDelete(id);
    } catch (error) {
      console.error('❌ [Repository] delete error:', error);
      throw error;
    }
  }

  // GET volunteers theo project (không lấy CANCELLED)
  async findByProject(opportunityId, status = null) {
    try {
      const filter = { opportunityId: opportunityId };
      if (status) {
        filter.status = status;
      } else {
        filter.status = { $ne: 'CANCELLED' };
      }

      return await this.model.find(filter)
          .populate('volunteerId', 'fullName email avatar')
          .sort({ createdAt: -1 })
          .lean();
    } catch (error) {
      console.error('❌ [Repository] findByProject error:', error);
      throw error;
    }
  }

  // GET volunteers PENDING theo project
  async findByVolPending(opportunityId) {
    try {
      return await this.model.find({
        opportunityId: opportunityId,
        status: 'PENDING'
      })
          .populate('volunteerId', 'fullName email avatar')
          .sort({ createdAt: -1 })
          .lean();
    } catch (error) {
      console.error('❌ [Repository] findByVolPending error:', error);
      throw error;
    }
  }

  // GET volunteers APPROVED theo project
  async findByVolApproved(opportunityId) {
    try {
      return await this.model.find({
        opportunityId: opportunityId,
        status: 'APPROVED'
      })
          .populate('volunteerId', 'fullName email avatar')
          .sort({ createdAt: -1 })
          .lean();
    } catch (error) {
      console.error('❌ [Repository] findByVolApproved error:', error);
      throw error;
    }
  }

  // GET volunteers REJECTED theo project
  async findByVolRejected(opportunityId) {
    try {
      return await this.model.find({
        opportunityId: opportunityId,
        status: 'REJECTED'
      })
          .populate('volunteerId', 'fullName email avatar')
          .sort({ createdAt: -1 })
          .lean();
    } catch (error) {
      console.error('❌ [Repository] findByVolRejected error:', error);
      throw error;
    }
  }

  // GET volunteers theo user
  async findByUser(volunteerId) {
    try {
      return await this.model.find({ volunteerId })
          .populate('opportunityId', 'title description')
          .sort({ createdAt: -1 })
          .lean();
    } catch (error) {
      console.error('❌ [Repository] findByUser error:', error);
      throw error;
    }
  }

  async findByUserWithProject(volunteerId) {
    try {
      return await this.model.find({ volunteerId })
        .populate({
          path: 'opportunityId',
          select: 'title coverMedia category targetAmount currentAmount location status organizerId startDate endDate stats createdAt',
          populate: {
            path: 'organizerId',
            select: 'fullName avatar',
          },
        })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error('❌ [Repository] findByUserWithProject error:', error);
      throw error;
    }
  }
}

export default VolunteerRepository;
