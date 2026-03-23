import Volunteer from './volunteer.model.js';

class VolunteerRepository {
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
      console.log("✅ [Repository] idddd:", result._id);
      return result;
    } catch (error) {
      console.error("❌ [Repository] Error:", error);
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