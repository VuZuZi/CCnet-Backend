import VerificationCheck from "./verificationCheck.model.js";

class VerificationCheckRepository {
  async create(payload, session = null) {
    const options = session ? { session } : {};
    const docs = await VerificationCheck.create([payload], options);
    return docs[0].toObject();
  }

  async findByOrganizerRequestId(organizerRequestId, { limit = 10 } = {}) {
    return VerificationCheck.find({ organizerRequestId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("requestedBy", "fullName email avatar")
      .lean()
      .exec();
  }

  async findLatestByOrganizerRequestId(organizerRequestId) {
    return VerificationCheck.findOne({ organizerRequestId })
      .sort({ createdAt: -1 })
      .populate("requestedBy", "fullName email avatar")
      .lean()
      .exec();
  }
}

export default VerificationCheckRepository;
