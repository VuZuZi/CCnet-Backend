import Volunteer from './volunteer.model.js';

class VolunteerRepository {
  // CHECK EXIST
  async exists(volunteerId, opportunityId) {
    return Volunteer.exists({ volunteerId, opportunityId });
  }

  // create đơn apply
  async create(data) {
    return await Volunteer.create({ data });
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