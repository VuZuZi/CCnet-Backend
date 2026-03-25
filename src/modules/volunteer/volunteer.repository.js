import Volunteer from './volunteer.model.js';

class VolunteerRepository {
  constructor() {
    // ✅ KHỞI TẠO this.model
    this.model = Volunteer;
    console.log('✅ Repository initialized with model:', this.model?.modelName);
  }
  // CHECK EXIST
  async exists(volunteerId, opportunityId) {
    return Volunteer.exists({ volunteerId, opportunityId });
  }

  // create đơn apply
  async create(data) {
    console.log("🔍 [Repository] Creating with data:", data);
    let result;
    try {
      // ✅ Kiểm tra data trước khi tạo
      if (!data.skills) {
        throw new Error('skills is required in repository');
      }
      if (!data.motivation) {
        throw new Error('motivation is required in repository');
      }
      if (!data.availability) {
        throw new Error('availability is required in repository');
      }
      result = await Volunteer.create(data);
      return result;
    } catch (error) {
      console.error("❌ [Repository] Error:", error);
      throw error;
    }
  }
  // ✅ SỬA: method application để check status
  async application({ volunteerId, opportunityId }) {
    console.log('🔍 [Repository] application called with:', { volunteerId, opportunityId });

    try {
      // ✅ SỬA: Dùng this.model.findOne, không phải this.model.Volunteers
      // const application = await this.model.application({
      //   volunteerId: volunteerId,
      //   opportunityId: opportunityId
      // });
      const application = await this.model.findOne({
        volunteerId: volunteerId,
        opportunityId: opportunityId
      });
      // console.log('✅ [Repository] application found:', application);
      return application;
    } catch (error) {
      console.error('❌ [Repository] application error:', error);
      throw error;
    }
  }
  async update(id, updateData) {
    console.log('🔍 [Repository] update:', { id, updateData });

    try {
      const updated = await this.model.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );
      return updated;
    } catch (error) {
      console.error('❌ [Repository] update error:', error);
      throw error;
    }
  }
  // xóa đơn
  async delete(volunteererId) {
    return await Volunteer.deleteOne({ volunteererId, volunteeringId });
  }

  // approve
  async approve(volunteererId) {
    return await Volunteer.status({ status: "Approve" });
  }

  // reject
  async reject(volunteererId) {
    return await Volunteer.status({ status: "Approve" });
  }

  // FIND BY ID
  async findById(id) {
    return Volunteer.findById(id);
  }
  // GET volunteers theo project
  async findByProject(opportunityId) {
    return Volunteer.find({ opportunityId })
      .populate('volunteerId', 'fullName email avatar')
      .lean();
  }

  // GET volunteers theo user
  async findByUser(volunteerId) {
    return Volunteer.find({ volunteerId })
      .populate('opportunityId')
      .lean();
  }
}

export default VolunteerRepository;