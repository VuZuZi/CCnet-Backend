import AgreementRecord from "./agreementRecord.model.js";

class AgreementRecordRepository {
  async create(payload, session = null) {
    const options = session ? { session } : {};
    const docs = await AgreementRecord.create([payload], options);
    return docs[0].toObject();
  }

  async findById(id) {
    return AgreementRecord.findById(id).lean().exec();
  }

  async findBySubject(subjectType, subjectId) {
    return AgreementRecord.findOne({ subjectType, subjectId }).lean().exec();
  }
}

export default AgreementRecordRepository;
